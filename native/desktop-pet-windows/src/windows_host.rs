#![allow(unsafe_op_in_unsafe_fn)]

mod picker_window;

use desktop_pet_app::{
    AppBootstrap, AppPaths, BundledLibraryInit, bootstrap_packaged, import_legacy_electron_data,
    load_preferences, refresh_pet_library, save_preferences, select_pet,
    set_launch_at_login as persist_launch_at_login,
};
use desktop_pet_core::bubbles::{
    BubbleCadence, add_recent_bubble_text, bubble_lines_for_scene, select_bubble_line,
};
use desktop_pet_core::geometry::{
    DragSession, PointI, RectI, SizeI, anchored_resize_handle_rect, bubble_position,
    bubble_size_for_content, centered_resize_position, drag_position, physical_px,
    rescale_drag_session, snap_mascot_width,
};
use desktop_pet_core::manifest::BubbleScene;
use desktop_pet_core::picker::PickerState;
use desktop_pet_core::state::{
    PetEvent, PetState, directional_drag_event, has_crossed_drag_threshold, transition_pet_state,
};
use desktop_pet_render::{Atlas, RenderedFrame, RgbaImage, decode_first_valid_atlas};
use std::collections::HashMap;
use std::env;
use std::ffi::{OsStr, c_void};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::mem::size_of;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::ptr::{copy_nonoverlapping, null, null_mut};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_ALREADY_EXISTS, ERROR_FILE_NOT_FOUND, ERROR_SUCCESS, GetLastError, HANDLE,
    HINSTANCE, HWND, POINT, RECT, SIZE,
};
use windows_sys::Win32::Graphics::Gdi::{
    AC_SRC_ALPHA, AC_SRC_OVER, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BLENDFUNCTION, BeginPaint,
    CLEARTYPE_QUALITY, CLIP_DEFAULT_PRECIS, CombineRgn, CreateCompatibleDC, CreateDIBSection,
    CreateFontW, CreatePen, CreateRectRgn, CreateRoundRectRgn, CreateSolidBrush, DEFAULT_CHARSET,
    DEFAULT_GUI_FONT, DEFAULT_PITCH, DIB_RGB_COLORS, DT_CALCRECT, DT_CENTER, DT_NOPREFIX,
    DT_SINGLELINE, DT_WORDBREAK, DeleteDC, DeleteObject, DrawTextW, EndPaint, FF_DONTCARE,
    FW_NORMAL, GetDC, GetMonitorInfoW, GetStockObject, InvalidateRect, MONITOR_DEFAULTTONEAREST,
    MONITORINFO, MonitorFromPoint, OUT_DEFAULT_PRECIS, PAINTSTRUCT, PS_SOLID, RGN_ERROR, RGN_OR,
    ReleaseDC, RoundRect, SelectObject, SetBkMode, SetTextColor, SetWindowRgn, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ, RegCloseKey,
    RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW,
};
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::Controls::WM_MOUSELEAVE;
use windows_sys::Win32::UI::HiDpi::{
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, GetDpiForSystem, GetDpiForWindow,
    SetProcessDpiAwarenessContext,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetCapture, ReleaseCapture, SetCapture, TME_LEAVE, TRACKMOUSEEVENT, TrackMouseEvent,
};
use windows_sys::Win32::UI::Shell::{
    NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NOTIFYICONDATAW, Shell_NotifyIconW,
    ShellExecuteW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CS_HREDRAW, CS_VREDRAW, CreatePopupMenu, CreateWindowExW, DefWindowProcW,
    DestroyMenu, DestroyWindow, DispatchMessageW, GetClientRect, GetCursorPos, GetMessageW,
    GetWindowRect, HWND_TOPMOST, IDC_ARROW, IDC_SIZENWSE, IDI_APPLICATION, KillTimer, LoadCursorW,
    LoadIconW, MA_NOACTIVATE, MF_SEPARATOR, MF_STRING, MSG, PostMessageW, PostQuitMessage,
    RegisterClassW, RegisterWindowMessageW, SW_HIDE, SW_SHOWNOACTIVATE, SW_SHOWNORMAL,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SetCursor, SetForegroundWindow,
    SetTimer, SetWindowPos, ShowWindow, TPM_NONOTIFY, TPM_RETURNCMD, TPM_RIGHTBUTTON,
    TrackPopupMenu, TranslateMessage, ULW_ALPHA, UpdateLayeredWindow, WM_APP, WM_CAPTURECHANGED,
    WM_CLOSE, WM_DESTROY, WM_DPICHANGED, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEACTIVATE,
    WM_MOUSEMOVE, WM_PAINT, WM_RBUTTONUP, WM_SETCURSOR, WM_TIMER, WNDCLASSW, WS_EX_LAYERED,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

const AUTOSTART_RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const LEGACY_ELECTRON_AUTOSTART_VALUE_NAMES: [&str; 2] = ["desktop-pet-mvp", "Desktop Pet MVP"];
const BUBBLE_WINDOW_CLASS_NAME: &str = "DesktopPetBubbleWindow";
const FRAME_TIMER_ID: usize = 1;
const BUBBLE_TIMER_ID: usize = 2;
const WELCOME_TIMER_ID: usize = 3;
const HOVER_LEAVE_TIMER_ID: usize = 4;
const MENU_EXIT_ID: usize = 10_001;
const MENU_OPEN_PICKER_ID: usize = 10_002;
const MENU_WAKE_ID: usize = 10_003;
const TRAY_ICON_ID: u32 = 1;
const TRAY_CALLBACK_MESSAGE: u32 = WM_APP + 1;
const DIRECTIONAL_DRAG_THRESHOLD_PX: i32 = 4;
const RESIZE_HANDLE_LOGICAL_PX: i32 = 28;
const HOVER_GRACE_LOGICAL_PX: i32 = 10;
const HOVER_LEAVE_POLL_MS: u32 = 120;
const BUBBLE_MIN_WIDTH_LOGICAL_PX: i32 = 120;
const BUBBLE_MAX_WIDTH_LOGICAL_PX: i32 = 240;
const BUBBLE_MIN_HEIGHT_LOGICAL_PX: i32 = 44;
const BUBBLE_MAX_HEIGHT_LOGICAL_PX: i32 = 92;
const BUBBLE_GAP_LOGICAL_PX: i32 = 10;
const BUBBLE_HORIZONTAL_PADDING_LOGICAL_PX: i32 = 14;
const BUBBLE_VERTICAL_PADDING_LOGICAL_PX: i32 = 9;
const BUBBLE_FONT_LOGICAL_PX: i32 = 14;
const BUBBLE_CORNER_RADIUS_LOGICAL_PX: i32 = 12;
const BUBBLE_DURATION_MS: u32 = 3_200;

static APP_STATE: OnceLock<Mutex<AppState>> = OnceLock::new();
static RUNTIME_IDENTITY: OnceLock<&'static RuntimeIdentity> = OnceLock::new();
static TASKBAR_CREATED_MESSAGE: AtomicU32 = AtomicU32::new(0);

struct RuntimeIdentity {
    window_class_name: &'static str,
    window_title: &'static str,
    instance_mutex_name: &'static str,
    autostart_value_name: &'static str,
    data_directory_name: &'static str,
    installed_exe_name: &'static str,
    log_file_name: &'static str,
    exit_label: &'static str,
}

const PRODUCTION_IDENTITY: RuntimeIdentity = RuntimeIdentity {
    window_class_name: "DesktopPetWindow",
    window_title: "Desktop Pet",
    instance_mutex_name: "Local\\DesktopPet.SingleInstance",
    autostart_value_name: "DesktopPet",
    data_directory_name: "DesktopPet",
    installed_exe_name: "DesktopPet.exe",
    log_file_name: "desktop-pet.log",
    exit_label: "退出桌宠",
};

struct AppState {
    atlas: Atlas,
    frames: Vec<RenderedFrame>,
    frame_index: usize,
    loop_start_index: Option<usize>,
    pet_state: PetState,
    dpi: u32,
    logical_width: i32,
    pointer: Option<PointerSession>,
    tracking_hover: bool,
    visible_bounds: RectI,
    resize_handle_rect: RectI,
    runtime: Runtime,
    bubble_hwnd: usize,
    bubble_text: String,
    recent_bubble_texts: Vec<String>,
    bubble_counter: u64,
    bubble_visible: bool,
    bubble_size: SizeI,
}

struct Runtime {
    paths: AppPaths,
    app: AppBootstrap,
    picker: PickerState,
    preview_cache: HashMap<String, Arc<RgbaImage>>,
}

struct LoadedRuntime {
    atlas: Atlas,
    logical_width: i32,
    runtime: Runtime,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct PointerSession {
    drag: DragSession,
    press_position: PointI,
    crossed_drag_threshold: bool,
    resize_start_width: Option<i32>,
}

impl AppState {
    fn new(runtime: LoadedRuntime, dpi: u32) -> Self {
        let mut state = Self {
            atlas: runtime.atlas,
            frames: Vec::new(),
            frame_index: 0,
            loop_start_index: None,
            pet_state: PetState::Idle,
            dpi,
            logical_width: runtime.logical_width,
            pointer: None,
            tracking_hover: false,
            visible_bounds: RectI {
                left: 0,
                top: 0,
                right: 1,
                bottom: 1,
            },
            resize_handle_rect: RectI {
                left: 0,
                top: 0,
                right: 1,
                bottom: 1,
            },
            runtime: runtime.runtime,
            bubble_hwnd: 0,
            bubble_text: String::new(),
            recent_bubble_texts: Vec::new(),
            bubble_counter: 0,
            bubble_visible: false,
            bubble_size: SizeI {
                width: physical_px(BUBBLE_MIN_WIDTH_LOGICAL_PX, dpi),
                height: physical_px(BUBBLE_MIN_HEIGHT_LOGICAL_PX, dpi),
            },
        };
        state.rebuild_frames(dpi);
        state
    }

    fn rebuild_frames(&mut self, dpi: u32) {
        let previous_size = self.frames.get(self.frame_index).map(|frame| SizeI {
            width: frame.width() as i32,
            height: frame.height() as i32,
        });
        self.dpi = dpi.max(96);
        let rendered =
            self.atlas
                .render_sequence(self.pet_state, self.logical_width, self.dpi, false);
        self.frames = rendered.frames;
        self.loop_start_index = rendered.loop_start_index;
        self.frame_index %= self.frames.len().max(1);
        let current_size = self.current_size();
        self.visible_bounds = self
            .frames
            .iter()
            .filter_map(RenderedFrame::hit_bounds)
            .fold(None, |bounds: Option<RectI>, next| {
                Some(bounds.map_or(next, |current| RectI {
                    left: current.left.min(next.left),
                    top: current.top.min(next.top),
                    right: current.right.max(next.right),
                    bottom: current.bottom.max(next.bottom),
                }))
            })
            .unwrap_or(RectI {
                left: 0,
                top: 0,
                right: current_size.width,
                bottom: current_size.height,
            });
        self.resize_handle_rect = anchored_resize_handle_rect(
            self.visible_bounds,
            current_size,
            self.resize_handle_size(),
        );
        if let (Some(previous_size), Some(pointer)) = (previous_size, self.pointer.as_mut()) {
            pointer.drag = rescale_drag_session(pointer.drag, previous_size, current_size);
        }
    }

    fn current_frame(&self) -> &RenderedFrame {
        &self.frames[self.frame_index]
    }

    fn current_size(&self) -> SizeI {
        let frame = self.current_frame();
        SizeI {
            width: frame.width() as i32,
            height: frame.height() as i32,
        }
    }

    fn resize_handle_size(&self) -> i32 {
        physical_px(RESIZE_HANDLE_LOGICAL_PX, self.dpi)
            .min(self.current_size().width)
            .min(self.current_size().height)
            .max(1)
    }

    fn is_resize_handle(&self, local: PointI) -> bool {
        self.resize_handle_rect.contains(local)
    }

    fn is_in_hover_grace_area(&self, local: PointI) -> bool {
        let size = self.current_size();
        let padding = physical_px(HOVER_GRACE_LOGICAL_PX, self.dpi);
        RectI {
            left: self
                .visible_bounds
                .left
                .min(self.resize_handle_rect.left)
                .saturating_sub(padding)
                .max(0),
            top: self
                .visible_bounds
                .top
                .min(self.resize_handle_rect.top)
                .saturating_sub(padding)
                .max(0),
            right: self
                .visible_bounds
                .right
                .max(self.resize_handle_rect.right)
                .saturating_add(padding)
                .min(size.width),
            bottom: self
                .visible_bounds
                .bottom
                .max(self.resize_handle_rect.bottom)
                .saturating_add(padding)
                .min(size.height),
        }
        .contains(local)
    }

    fn apply_event(&mut self, event: PetEvent) -> bool {
        let next = transition_pet_state(self.pet_state, event);
        if next == self.pet_state {
            return false;
        }
        self.pet_state = next;
        self.frame_index = 0;
        self.rebuild_frames(self.dpi);
        true
    }

    fn next_bubble_text(&mut self, scene: BubbleScene) -> Option<String> {
        let selected = self.runtime.app.selected_pet()?;
        let runtime_id = selected.runtime_id.clone();
        let lines = bubble_lines_for_scene(Some(&selected.manifest), scene, BubbleCadence::Normal);
        self.bubble_counter = self.bubble_counter.wrapping_add(1);
        let seed = format!("{runtime_id}:{scene:?}:{}", self.bubble_counter);
        let text = select_bubble_line(&lines, &seed, &self.recent_bubble_texts, "");
        if text.is_empty() {
            return None;
        }
        self.recent_bubble_texts = add_recent_bubble_text(&self.recent_bubble_texts, &text, 4);
        self.bubble_text.clone_from(&text);
        Some(text)
    }

    fn advance_frame(&mut self) {
        let next_index = self.frame_index + 1;
        if matches!(self.pet_state, PetState::Waving | PetState::Jumping)
            && self.loop_start_index == Some(next_index)
        {
            self.apply_event(PetEvent::ActionComplete);
            return;
        }
        if next_index < self.frames.len() {
            self.frame_index = next_index;
        } else if let Some(loop_start_index) = self.loop_start_index {
            self.frame_index = loop_start_index;
        }
    }
}

struct OwnedHandle(HANDLE);

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        unsafe {
            if !self.0.is_null() {
                CloseHandle(self.0);
            }
        }
    }
}

pub fn run() -> Result<(), String> {
    run_with(&PRODUCTION_IDENTITY)
}

fn run_with(identity: &'static RuntimeIdentity) -> Result<(), String> {
    RUNTIME_IDENTITY
        .set(identity)
        .map_err(|_| "native runtime identity was initialized twice".to_string())?;
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|arg| arg == "--install-autostart") {
        let installed = install_autostart()?;
        println!("Autostart installed: {}", installed.display());
        println!("Sign out and back in, then inspect the runtime log under LOCALAPPDATA.");
        return Ok(());
    }
    if args.iter().any(|arg| arg == "--uninstall-autostart") {
        uninstall_autostart()?;
        println!("Autostart registry entry removed.");
        return Ok(());
    }

    log_event(&format!(
        "event=process_start source={} pid={} exe={}",
        if args.iter().any(|arg| arg == "--autostart") {
            "autostart"
        } else {
            "manual"
        },
        std::process::id(),
        env::current_exe()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| "unknown".into()),
    ));

    let Some(_instance_guard) = acquire_single_instance()? else {
        log_event("event=duplicate_instance_rejected");
        return Ok(());
    };

    unsafe {
        SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }

    let runtime = load_runtime(identity)?;
    let dpi = unsafe { GetDpiForSystem() }.max(96);
    APP_STATE
        .set(Mutex::new(AppState::new(runtime, dpi)))
        .map_err(|_| "native app state was initialized twice".to_string())?;

    unsafe { run_message_loop() }
}

fn load_runtime(identity: &RuntimeIdentity) -> Result<LoadedRuntime, String> {
    let data_root = runtime_data_directory(identity)?;
    let paths = AppPaths::for_data_root(&data_root);
    if let Some(legacy_root) = legacy_electron_data_directory() {
        match import_legacy_electron_data(&legacy_root, &paths) {
            Ok(result) if result.imported => {
                log_event(&format!(
                    "event=legacy_electron_imported settings={} seed_marker={} copied={} preserved={} skipped={}",
                    result.settings_copied,
                    result.seed_marker_copied,
                    result.copied_folders.len(),
                    result.preserved_folders.len(),
                    result.skipped_folders.len(),
                ));
                for issue in result.issues {
                    log_event(&format!(
                        "event=legacy_electron_import_issue detail={}",
                        log_value(&issue),
                    ));
                }
            }
            Ok(_) => {}
            Err(error) => log_event(&format!(
                "event=legacy_electron_import_error error={}",
                log_value(&error.to_string()),
            )),
        }
    }
    let executable = env::current_exe().map_err(|error| format!("current_exe failed: {error}"))?;
    let bundled_seed = executable
        .parent()
        .map(|parent| parent.join("pets-seed"))
        .filter(|path| path.is_dir());
    let mut app = bootstrap_packaged(&paths, bundled_seed.as_deref())
        .map_err(|error| format!("app bootstrap failed: {error}"))?;
    match &app.bundled_library {
        BundledLibraryInit::None => log_event("event=bundled_library_ready mode=none"),
        BundledLibraryInit::Seeded(result) => log_event(&format!(
            "event=bundled_library_ready mode=seeded changed={} copied={} preserved={}",
            result.seeded,
            result.copied_folders.len(),
            result.preserved_folders.len(),
        )),
        BundledLibraryInit::Consumed(result) => log_event(&format!(
            "event=bundled_library_ready mode=consumed changed={} moved={} preserved={}",
            result.consumed,
            result.moved_folders.len(),
            result.preserved_folders.len(),
        )),
    }
    for issue in &app.library_issues {
        log_event(&format!(
            "event=pet_library_issue severity={:?} kind={:?} folder={} detail={}",
            issue.severity,
            issue.kind,
            log_value(&issue.folder_name),
            log_value(&issue.detail),
        ));
    }
    let (atlas, selected) = decode_runtime_atlas(&paths, &mut app)?;
    let selected_id = selected.runtime_id.clone();
    let logical_width = app.mascot_width_px();
    let mut picker = PickerState::new(app.selected_pet_id());
    picker.sync_pets(&app.pets);
    if app.preferences.launch_at_login {
        install_autostart()?;
    } else {
        uninstall_autostart()?;
    }
    if let Err(error) = remove_legacy_electron_autostart() {
        log_event(&format!(
            "event=legacy_autostart_cleanup_error error={}",
            log_value(&error),
        ));
    }
    log_event(&format!(
        "event=pet_loaded id={} width={} path={}",
        log_value(&selected_id),
        logical_width,
        log_value(&selected.spritesheet.display().to_string()),
    ));
    Ok(LoadedRuntime {
        atlas,
        logical_width,
        runtime: Runtime {
            paths,
            app,
            picker,
            preview_cache: HashMap::new(),
        },
    })
}

pub fn report_fatal(error: &str) {
    log_event(&format!(
        "event=fatal_error error={}",
        error.replace(['\r', '\n'], " "),
    ));
}

unsafe fn run_message_loop() -> Result<(), String> {
    let instance = GetModuleHandleW(null());
    if instance.is_null() {
        return Err(last_error("GetModuleHandleW"));
    }

    let identity = runtime_identity()?;
    let class_name = wide(identity.window_class_name);
    let window_class = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        hInstance: instance,
        hCursor: LoadCursorW(null_mut(), IDC_ARROW),
        lpszClassName: class_name.as_ptr(),
        ..WNDCLASSW::default()
    };
    if RegisterClassW(&window_class) == 0 {
        return Err(last_error("RegisterClassW"));
    }
    register_bubble_window_class(instance)?;
    picker_window::register(instance)?;

    let provisional_size = with_state(|state| state.current_size())?;
    let provisional_position = initial_window_position(provisional_size)?;
    let title = wide(identity.window_title);
    let hwnd = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        class_name.as_ptr(),
        title.as_ptr(),
        WS_POPUP,
        provisional_position.x,
        provisional_position.y,
        provisional_size.width,
        provisional_size.height,
        null_mut(),
        null_mut(),
        instance,
        null(),
    );
    if hwnd.is_null() {
        return Err(last_error("CreateWindowExW"));
    }
    let bubble_hwnd = create_bubble_window(instance, hwnd)?;
    with_state_mut(|state| state.bubble_hwnd = bubble_hwnd as usize)?;

    let dpi = GetDpiForWindow(hwnd).max(96);
    with_state_mut(|state| state.rebuild_frames(dpi))?;
    let size = with_state(|state| state.current_size())?;
    let initial_position = initial_window_position(size)?;
    if SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        initial_position.x,
        initial_position.y,
        size.width,
        size.height,
        SWP_NOACTIVATE,
    ) == 0
    {
        DestroyWindow(hwnd);
        return Err(last_error("SetWindowPos(initial)"));
    }

    present_current_frame(hwnd)?;
    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
    );
    let taskbar_created = wide("TaskbarCreated");
    TASKBAR_CREATED_MESSAGE.store(
        RegisterWindowMessageW(taskbar_created.as_ptr()),
        Ordering::Release,
    );
    add_tray_icon(hwnd);
    schedule_next_frame(hwnd)?;
    log_event(&format!(
        "event=window_visible dpi={} x={} y={} width={} height={}",
        with_state(|state| state.dpi)?,
        initial_position.x,
        initial_position.y,
        size.width,
        size.height,
    ));
    if SetTimer(hwnd, WELCOME_TIMER_ID, 260, None) == 0 {
        log_event(&format!(
            "event=welcome_timer_error error={}",
            last_error("SetTimer(welcome)"),
        ));
    }

    let mut message = MSG::default();
    loop {
        let result = GetMessageW(&mut message, null_mut(), 0, 0);
        if result == -1 {
            return Err(last_error("GetMessageW"));
        }
        if result == 0 {
            break;
        }
        if picker_window::handle_dialog_message(&mut message) {
            continue;
        }
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    log_event("event=process_exit");
    Ok(())
}

unsafe fn register_bubble_window_class(instance: HINSTANCE) -> Result<(), String> {
    let class_name = wide(BUBBLE_WINDOW_CLASS_NAME);
    let window_class = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(bubble_window_proc),
        hInstance: instance,
        hCursor: LoadCursorW(null_mut(), IDC_ARROW),
        lpszClassName: class_name.as_ptr(),
        ..WNDCLASSW::default()
    };
    if RegisterClassW(&window_class) == 0 {
        return Err(last_error("RegisterClassW(bubble)"));
    }
    Ok(())
}

unsafe fn create_bubble_window(instance: HINSTANCE, owner: HWND) -> Result<HWND, String> {
    let class_name = wide(BUBBLE_WINDOW_CLASS_NAME);
    let title = wide("");
    let hwnd = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT,
        class_name.as_ptr(),
        title.as_ptr(),
        WS_POPUP,
        0,
        0,
        1,
        1,
        owner,
        null_mut(),
        instance,
        null(),
    );
    if hwnd.is_null() {
        return Err(last_error("CreateWindowExW(bubble)"));
    }
    Ok(hwnd)
}

unsafe extern "system" fn bubble_window_proc(
    hwnd: HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    match message {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as isize,
        WM_PAINT => {
            paint_bubble(hwnd);
            0
        }
        WM_DESTROY => {
            let _ = with_state_mut(|state| {
                if state.bubble_hwnd == hwnd as usize {
                    state.bubble_hwnd = 0;
                    state.bubble_visible = false;
                }
            });
            0
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}

unsafe fn paint_bubble(hwnd: HWND) {
    let text = with_state(|state| state.bubble_text.clone()).unwrap_or_default();
    let mut paint = PAINTSTRUCT::default();
    let device = BeginPaint(hwnd, &mut paint);
    if device.is_null() {
        return;
    }
    let mut bounds = RECT::default();
    if GetClientRect(hwnd, &mut bounds) == 0 {
        EndPaint(hwnd, &paint);
        return;
    }

    let dpi = GetDpiForWindow(hwnd).max(96);
    let brush = CreateSolidBrush(color_ref(255, 253, 249));
    let pen = CreatePen(
        PS_SOLID,
        physical_px(1, dpi).max(1),
        color_ref(184, 175, 161),
    );
    if brush.is_null() || pen.is_null() {
        if !brush.is_null() {
            DeleteObject(brush);
        }
        if !pen.is_null() {
            DeleteObject(pen);
        }
        EndPaint(hwnd, &paint);
        return;
    }
    let old_brush = SelectObject(device, brush);
    let old_pen = SelectObject(device, pen);
    let radius = physical_px(BUBBLE_CORNER_RADIUS_LOGICAL_PX, dpi);
    RoundRect(
        device,
        bounds.left,
        bounds.top,
        bounds.right,
        bounds.bottom,
        radius,
        radius,
    );

    let font = create_bubble_font(dpi);
    let selected_font = if font.is_null() {
        GetStockObject(DEFAULT_GUI_FONT)
    } else {
        font
    };
    let old_font = SelectObject(device, selected_font);
    SetBkMode(device, TRANSPARENT as i32);
    SetTextColor(device, color_ref(42, 38, 33));
    let horizontal_padding = physical_px(BUBBLE_HORIZONTAL_PADDING_LOGICAL_PX, dpi);
    let vertical_padding = physical_px(BUBBLE_VERTICAL_PADDING_LOGICAL_PX, dpi);
    let mut text_bounds = RECT {
        left: bounds.left + horizontal_padding,
        top: bounds.top + vertical_padding,
        right: bounds.right - horizontal_padding,
        bottom: bounds.bottom - vertical_padding,
    };
    let wide_text = wide(text);
    DrawTextW(
        device,
        wide_text.as_ptr(),
        -1,
        &mut text_bounds,
        DT_CENTER | DT_WORDBREAK | DT_NOPREFIX,
    );

    SelectObject(device, old_font);
    SelectObject(device, old_pen);
    SelectObject(device, old_brush);
    DeleteObject(pen);
    DeleteObject(brush);
    if !font.is_null() {
        DeleteObject(font);
    }
    EndPaint(hwnd, &paint);
}

unsafe fn create_bubble_font(dpi: u32) -> *mut c_void {
    let face = wide("Segoe UI");
    CreateFontW(
        -physical_px(BUBBLE_FONT_LOGICAL_PX, dpi),
        0,
        0,
        0,
        FW_NORMAL as i32,
        0,
        0,
        0,
        DEFAULT_CHARSET as u32,
        OUT_DEFAULT_PRECIS as u32,
        CLIP_DEFAULT_PRECIS as u32,
        CLEARTYPE_QUALITY as u32,
        (DEFAULT_PITCH | FF_DONTCARE) as u32,
        face.as_ptr(),
    )
}

unsafe fn measure_bubble_size(hwnd: HWND, text: &str, dpi: u32) -> SizeI {
    let minimum = SizeI {
        width: physical_px(BUBBLE_MIN_WIDTH_LOGICAL_PX, dpi),
        height: physical_px(BUBBLE_MIN_HEIGHT_LOGICAL_PX, dpi),
    };
    let maximum = SizeI {
        width: physical_px(BUBBLE_MAX_WIDTH_LOGICAL_PX, dpi),
        height: physical_px(BUBBLE_MAX_HEIGHT_LOGICAL_PX, dpi),
    };
    let padding = SizeI {
        width: physical_px(BUBBLE_HORIZONTAL_PADDING_LOGICAL_PX, dpi),
        height: physical_px(BUBBLE_VERTICAL_PADDING_LOGICAL_PX, dpi),
    };
    let device = GetDC(hwnd);
    if device.is_null() {
        return minimum;
    }
    let font = create_bubble_font(dpi);
    let selected_font = if font.is_null() {
        GetStockObject(DEFAULT_GUI_FONT)
    } else {
        font
    };
    let old_font = SelectObject(device, selected_font);
    let display_text = if text.trim().is_empty() { " " } else { text };
    let wide_text = wide(display_text);
    let mut single_line = RECT::default();
    DrawTextW(
        device,
        wide_text.as_ptr(),
        -1,
        &mut single_line,
        DT_CALCRECT | DT_SINGLELINE | DT_NOPREFIX,
    );
    let maximum_content_width = (maximum.width - padding.width * 2).max(1);
    let content_width = (single_line.right - single_line.left)
        .max(1)
        .min(maximum_content_width);
    let mut wrapped = RECT {
        left: 0,
        top: 0,
        right: content_width,
        bottom: 0,
    };
    DrawTextW(
        device,
        wide_text.as_ptr(),
        -1,
        &mut wrapped,
        DT_CALCRECT | DT_WORDBREAK | DT_NOPREFIX,
    );
    let content = SizeI {
        width: content_width,
        height: (wrapped.bottom - wrapped.top).max(physical_px(BUBBLE_FONT_LOGICAL_PX, dpi)),
    };
    SelectObject(device, old_font);
    if !font.is_null() {
        DeleteObject(font);
    }
    ReleaseDC(hwnd, device);
    bubble_size_for_content(content, minimum, maximum, padding)
}

unsafe fn refresh_bubble_size(hwnd: HWND, dpi: u32) {
    if hwnd.is_null() {
        return;
    }
    let text = with_state(|state| state.bubble_text.clone()).unwrap_or_default();
    let size = measure_bubble_size(hwnd, &text, dpi);
    let _ = with_state_mut(|state| state.bubble_size = size);
}

fn color_ref(red: u8, green: u8, blue: u8) -> u32 {
    u32::from(red) | (u32::from(green) << 8) | (u32::from(blue) << 16)
}

unsafe fn show_bubble(pet_hwnd: HWND, scene: BubbleScene) {
    let bubble_hwnd = with_state_mut(|state| {
        if state.bubble_hwnd == 0 || state.next_bubble_text(scene).is_none() {
            return None;
        }
        state.bubble_visible = true;
        Some(state.bubble_hwnd as HWND)
    })
    .unwrap_or(None);
    let Some(bubble_hwnd) = bubble_hwnd else {
        return;
    };
    let dpi = with_state(|state| state.dpi).unwrap_or(96);
    refresh_bubble_size(bubble_hwnd, dpi);
    position_bubble(pet_hwnd, true, true);
    InvalidateRect(bubble_hwnd, null(), 1);
    KillTimer(pet_hwnd, BUBBLE_TIMER_ID);
    if SetTimer(pet_hwnd, BUBBLE_TIMER_ID, BUBBLE_DURATION_MS, None) == 0 {
        log_event(&format!(
            "event=bubble_timer_error error={}",
            last_error("SetTimer(bubble)"),
        ));
    }
    log_event(&format!("event=bubble_shown scene={scene:?}"));
}

unsafe fn position_bubble(pet_hwnd: HWND, reveal: bool, refresh_region: bool) {
    let Ok((bubble_hwnd, visible, dpi, size)) = with_state(|state| {
        (
            state.bubble_hwnd as HWND,
            state.bubble_visible,
            state.dpi,
            state.bubble_size,
        )
    }) else {
        return;
    };
    if bubble_hwnd.is_null() || !visible {
        return;
    }
    let Some(pet_rect) = window_rect(pet_hwnd) else {
        return;
    };
    let center = PointI {
        x: pet_rect.left + (pet_rect.right - pet_rect.left) / 2,
        y: pet_rect.top + (pet_rect.bottom - pet_rect.top) / 2,
    };
    let Ok(work_area) = work_area_for(center) else {
        return;
    };
    let position = bubble_position(
        RectI {
            left: pet_rect.left,
            top: pet_rect.top,
            right: pet_rect.right,
            bottom: pet_rect.bottom,
        },
        size,
        work_area,
        physical_px(BUBBLE_GAP_LOGICAL_PX, dpi),
    );

    if refresh_region {
        let radius = physical_px(BUBBLE_CORNER_RADIUS_LOGICAL_PX, dpi);
        let region = CreateRoundRectRgn(0, 0, size.width + 1, size.height + 1, radius, radius);
        if region.is_null() {
            log_event(&format!(
                "event=bubble_region_error error={}",
                last_error("CreateRoundRectRgn"),
            ));
            return;
        }
        if SetWindowRgn(bubble_hwnd, region, 1) == 0 {
            DeleteObject(region);
            log_event(&format!(
                "event=bubble_region_error error={}",
                last_error("SetWindowRgn(bubble)"),
            ));
            return;
        }
    }
    let flags = SWP_NOACTIVATE | if reveal { SWP_SHOWWINDOW } else { 0 };
    if SetWindowPos(
        bubble_hwnd,
        HWND_TOPMOST,
        position.x,
        position.y,
        size.width,
        size.height,
        flags,
    ) == 0
    {
        log_event(&format!(
            "event=bubble_position_error error={}",
            last_error("SetWindowPos(bubble)"),
        ));
    }
}

unsafe fn hide_bubble(pet_hwnd: HWND) {
    KillTimer(pet_hwnd, BUBBLE_TIMER_ID);
    let bubble_hwnd = with_state_mut(|state| {
        state.bubble_visible = false;
        state.bubble_hwnd as HWND
    })
    .unwrap_or(null_mut());
    if !bubble_hwnd.is_null() {
        ShowWindow(bubble_hwnd, SW_HIDE);
    }
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    let taskbar_created_message = TASKBAR_CREATED_MESSAGE.load(Ordering::Acquire);
    if taskbar_created_message != 0 && message == taskbar_created_message {
        add_tray_icon(hwnd);
        return 0;
    }
    match message {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as isize,
        WM_LBUTTONDOWN => {
            if let (Some(cursor), Some(rect)) = (cursor_position(), window_rect(hwnd)) {
                let session = DragSession {
                    pointer_offset: PointI {
                        x: cursor.x - rect.left,
                        y: cursor.y - rect.top,
                    },
                };
                let resize_start_width = with_state(|state| {
                    let local = PointI {
                        x: cursor.x - rect.left,
                        y: cursor.y - rect.top,
                    };
                    (state.tracking_hover && state.is_resize_handle(local))
                        .then_some(state.logical_width)
                })
                .ok()
                .flatten();
                let _ = with_state_mut(|state| {
                    state.pointer = Some(PointerSession {
                        drag: session,
                        press_position: cursor,
                        crossed_drag_threshold: false,
                        resize_start_width,
                    });
                    resize_start_width.is_none() && state.apply_event(PetEvent::Press)
                });
                SetCapture(hwnd);
                log_event(if resize_start_width.is_some() {
                    "event=resize_start"
                } else {
                    "event=pointer_press"
                });
            }
            0
        }
        WM_MOUSEMOVE => {
            KillTimer(hwnd, HOVER_LEAVE_TIMER_ID);
            if GetCapture() == hwnd {
                let resizing = with_state(|state| {
                    state
                        .pointer
                        .is_some_and(|pointer| pointer.resize_start_width.is_some())
                })
                .unwrap_or(false);
                if resizing {
                    resize_dragged_window(hwnd);
                } else {
                    move_dragged_window(hwnd);
                }
            } else {
                begin_hover_tracking(hwnd);
            }
            update_pet_cursor(hwnd);
            0
        }
        WM_LBUTTONUP => {
            finish_drag(hwnd);
            0
        }
        WM_CAPTURECHANGED => {
            let pointer = with_state_mut(|state| state.pointer.take()).unwrap_or(None);
            if let Some(pointer) = pointer {
                if pointer.resize_start_width.is_some() {
                    persist_current_mascot_width();
                } else if pointer.crossed_drag_threshold {
                    apply_pet_event(hwnd, PetEvent::DragEnd);
                }
            }
            0
        }
        WM_MOUSELEAVE => {
            schedule_hover_leave_check(hwnd);
            0
        }
        WM_SETCURSOR => {
            if update_pet_cursor(hwnd) {
                1
            } else {
                DefWindowProcW(hwnd, message, wparam, lparam)
            }
        }
        WM_RBUTTONUP => {
            show_context_menu(hwnd);
            0
        }
        TRAY_CALLBACK_MESSAGE => {
            match lparam as u32 {
                WM_LBUTTONUP => reveal_pet_window(hwnd),
                WM_RBUTTONUP => show_tray_context_menu(hwnd),
                _ => {}
            }
            0
        }
        WM_TIMER if wparam == BUBBLE_TIMER_ID => {
            hide_bubble(hwnd);
            0
        }
        WM_TIMER if wparam == WELCOME_TIMER_ID => {
            KillTimer(hwnd, WELCOME_TIMER_ID);
            show_bubble(hwnd, BubbleScene::Welcome);
            0
        }
        WM_TIMER if wparam == HOVER_LEAVE_TIMER_ID => {
            finish_hover_leave_if_needed(hwnd);
            0
        }
        WM_TIMER if wparam == FRAME_TIMER_ID => {
            KillTimer(hwnd, FRAME_TIMER_ID);
            let _ = with_state_mut(|state| state.advance_frame());
            if let Err(error) = present_current_frame(hwnd).and_then(|_| schedule_next_frame(hwnd))
            {
                log_event(&format!("event=animation_error error={error}"));
            }
            0
        }
        WM_DPICHANGED => {
            let dpi = (wparam as u32 & 0xffff).max(96);
            let _ = with_state_mut(|state| state.rebuild_frames(dpi));
            let bubble_hwnd = with_state(|state| state.bubble_hwnd as HWND).unwrap_or(null_mut());
            refresh_bubble_size(bubble_hwnd, dpi);
            if lparam != 0 {
                let suggested = *(lparam as *const RECT);
                if let Ok(size) = with_state(|state| state.current_size()) {
                    SetWindowPos(
                        hwnd,
                        HWND_TOPMOST,
                        suggested.left,
                        suggested.top,
                        size.width,
                        size.height,
                        SWP_NOACTIVATE,
                    );
                }
            }
            if let Err(error) = present_current_frame(hwnd) {
                log_event(&format!("event=dpi_render_error dpi={dpi} error={error}"));
            } else {
                position_bubble(hwnd, false, true);
                log_event(&format!("event=dpi_changed dpi={dpi}"));
            }
            0
        }
        WM_CLOSE => {
            DestroyWindow(hwnd);
            0
        }
        WM_DESTROY => {
            remove_tray_icon(hwnd);
            KillTimer(hwnd, FRAME_TIMER_ID);
            KillTimer(hwnd, BUBBLE_TIMER_ID);
            KillTimer(hwnd, WELCOME_TIMER_ID);
            KillTimer(hwnd, HOVER_LEAVE_TIMER_ID);
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}

unsafe fn move_dragged_window(hwnd: HWND) {
    let Some(cursor) = cursor_position() else {
        return;
    };
    let Ok((pointer, size)) = with_state(|state| (state.pointer, state.current_size())) else {
        return;
    };
    let Some(pointer) = pointer else {
        return;
    };
    if pointer.resize_start_width.is_some() {
        return;
    }
    let delta_x = cursor.x - pointer.press_position.x;
    let delta_y = cursor.y - pointer.press_position.y;
    let crossed_threshold =
        has_crossed_drag_threshold(delta_x, delta_y, DIRECTIONAL_DRAG_THRESHOLD_PX);
    let changed = with_state_mut(|state| {
        if crossed_threshold && let Some(pointer) = state.pointer.as_mut() {
            pointer.crossed_drag_threshold = true;
        }
        directional_drag_event(delta_x, DIRECTIONAL_DRAG_THRESHOLD_PX)
            .is_some_and(|event| state.apply_event(event))
    })
    .unwrap_or(false);
    if changed {
        restart_animation(hwnd);
    }
    let Ok(work_area) = work_area_for(cursor) else {
        return;
    };
    let position = drag_position(cursor, pointer.drag, size, work_area);
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        position.x,
        position.y,
        0,
        0,
        SWP_NOSIZE | SWP_NOACTIVATE,
    );
    position_bubble(hwnd, false, false);
}

unsafe fn resize_dragged_window(hwnd: HWND) {
    let Some(cursor) = cursor_position() else {
        return;
    };
    let Some(previous_rect) = window_rect(hwnd) else {
        return;
    };
    let Ok(work_area) = work_area_for(cursor) else {
        return;
    };
    let next_size = with_state_mut(|state| {
        let pointer = state.pointer?;
        let start_width = pointer.resize_start_width?;
        let delta_logical =
            f64::from(cursor.x - pointer.press_position.x) * 96.0 / f64::from(state.dpi.max(96));
        let next_width = snap_mascot_width(f64::from(start_width) + delta_logical);
        if next_width == state.logical_width {
            return None;
        }
        state.logical_width = next_width;
        state.rebuild_frames(state.dpi);
        Some(state.current_size())
    })
    .unwrap_or(None);
    let Some(next_size) = next_size else {
        return;
    };
    let next_position = centered_resize_position(
        RectI {
            left: previous_rect.left,
            top: previous_rect.top,
            right: previous_rect.right,
            bottom: previous_rect.bottom,
        },
        next_size,
        work_area,
    );
    if SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        next_position.x,
        next_position.y,
        next_size.width,
        next_size.height,
        SWP_NOACTIVATE,
    ) == 0
    {
        log_event(&format!(
            "event=resize_window_error error={}",
            last_error("SetWindowPos(resize)"),
        ));
        return;
    }
    restart_animation(hwnd);
    position_bubble(hwnd, false, true);
}

unsafe fn finish_drag(hwnd: HWND) {
    let pointer = with_state_mut(|state| state.pointer.take()).unwrap_or(None);
    if GetCapture() == hwnd {
        ReleaseCapture();
    }
    if let Some(pointer) = pointer {
        if pointer.resize_start_width.is_some() {
            persist_current_mascot_width();
            log_event("event=resize_end");
        } else if pointer.crossed_drag_threshold {
            apply_pet_event(hwnd, PetEvent::DragEnd);
            show_bubble(hwnd, BubbleScene::Drag);
            log_event("event=drag_end");
        } else {
            apply_pet_event(hwnd, PetEvent::Click);
            show_bubble(hwnd, BubbleScene::Click);
            log_event("event=click");
        }
    }
}

unsafe fn begin_hover_tracking(hwnd: HWND) {
    let entered = with_state_mut(|state| {
        let entered = !state.tracking_hover;
        state.tracking_hover = true;
        entered
    })
    .unwrap_or(false);
    let mut tracking = TRACKMOUSEEVENT {
        cbSize: size_of::<TRACKMOUSEEVENT>() as u32,
        dwFlags: TME_LEAVE,
        hwndTrack: hwnd,
        dwHoverTime: 0,
    };
    if TrackMouseEvent(&mut tracking) == 0 {
        if entered {
            let _ = with_state_mut(|state| state.tracking_hover = false);
        }
        return;
    }
    if entered && !apply_pet_event(hwnd, PetEvent::HoverEnter) {
        restart_animation(hwnd);
    }
}

unsafe fn schedule_hover_leave_check(hwnd: HWND) {
    KillTimer(hwnd, HOVER_LEAVE_TIMER_ID);
    if SetTimer(hwnd, HOVER_LEAVE_TIMER_ID, HOVER_LEAVE_POLL_MS, None) == 0 {
        finish_hover_leave_if_needed(hwnd);
    }
}

unsafe fn finish_hover_leave_if_needed(hwnd: HWND) {
    KillTimer(hwnd, HOVER_LEAVE_TIMER_ID);
    if GetCapture() == hwnd {
        return;
    }
    let still_near = cursor_local_to_window(hwnd).is_some_and(|local| {
        with_state(|state| state.is_in_hover_grace_area(local)).unwrap_or(false)
    });
    if still_near {
        if SetTimer(hwnd, HOVER_LEAVE_TIMER_ID, HOVER_LEAVE_POLL_MS, None) == 0 {
            let _ = with_state_mut(|state| state.tracking_hover = false);
        }
        return;
    }
    let was_hovering = with_state_mut(|state| std::mem::replace(&mut state.tracking_hover, false))
        .unwrap_or(false);
    if was_hovering && !apply_pet_event(hwnd, PetEvent::HoverLeave) {
        restart_animation(hwnd);
    }
}

unsafe fn update_pet_cursor(hwnd: HWND) -> bool {
    let on_resize_handle = cursor_local_to_window(hwnd).is_some_and(|local| {
        with_state(|state| {
            (state.tracking_hover
                || state
                    .pointer
                    .is_some_and(|pointer| pointer.resize_start_width.is_some()))
                && state.is_resize_handle(local)
        })
        .unwrap_or(false)
    });
    if !on_resize_handle {
        return false;
    }
    let cursor = LoadCursorW(null_mut(), IDC_SIZENWSE);
    if !cursor.is_null() {
        SetCursor(cursor);
    }
    true
}

unsafe fn cursor_local_to_window(hwnd: HWND) -> Option<PointI> {
    let cursor = cursor_position()?;
    let rect = window_rect(hwnd)?;
    Some(PointI {
        x: cursor.x - rect.left,
        y: cursor.y - rect.top,
    })
}

unsafe fn apply_pet_event(hwnd: HWND, event: PetEvent) -> bool {
    let changed = with_state_mut(|state| state.apply_event(event)).unwrap_or(false);
    if changed {
        let pet_state = with_state(|state| state.pet_state).ok();
        log_event(&format!("event=pet_state state={pet_state:?}"));
        restart_animation(hwnd);
    }
    changed
}

unsafe fn restart_animation(hwnd: HWND) {
    KillTimer(hwnd, FRAME_TIMER_ID);
    if let Err(error) = present_current_frame(hwnd).and_then(|_| schedule_next_frame(hwnd)) {
        log_event(&format!("event=animation_restart_error error={error}"));
    }
}

unsafe fn tray_icon_data(hwnd: HWND) -> NOTIFYICONDATAW {
    let mut data = NOTIFYICONDATAW {
        cbSize: size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: TRAY_ICON_ID,
        uFlags: NIF_MESSAGE | NIF_ICON | NIF_TIP,
        uCallbackMessage: TRAY_CALLBACK_MESSAGE,
        hIcon: LoadIconW(null_mut(), IDI_APPLICATION),
        ..NOTIFYICONDATAW::default()
    };
    let tooltip = wide("Desktop Pet");
    let length = tooltip
        .len()
        .saturating_sub(1)
        .min(data.szTip.len().saturating_sub(1));
    data.szTip[..length].copy_from_slice(&tooltip[..length]);
    data
}

unsafe fn add_tray_icon(hwnd: HWND) {
    let data = tray_icon_data(hwnd);
    if Shell_NotifyIconW(NIM_ADD, &data) == 0 {
        log_event(&format!(
            "event=tray_add_error error={}",
            last_error("Shell_NotifyIconW(NIM_ADD)"),
        ));
    } else {
        log_event("event=tray_ready");
    }
}

unsafe fn remove_tray_icon(hwnd: HWND) {
    let data = tray_icon_data(hwnd);
    Shell_NotifyIconW(NIM_DELETE, &data);
}

unsafe fn reveal_pet_window(hwnd: HWND) {
    let cursor = cursor_position().unwrap_or(PointI { x: 0, y: 0 });
    let Ok(work_area) = work_area_for(cursor) else {
        return;
    };
    let Ok(size) = with_state(|state| state.current_size()) else {
        return;
    };
    let position = PointI {
        x: work_area.left + (work_area.width() - size.width) / 2,
        y: work_area.top + (work_area.height() - size.height) / 2,
    };
    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        position.x,
        position.y,
        size.width,
        size.height,
        SWP_NOACTIVATE | SWP_SHOWWINDOW,
    );
    position_bubble(hwnd, false, false);
    log_event("event=pet_revealed_from_tray");
}

unsafe fn show_tray_context_menu(hwnd: HWND) {
    let Some(cursor) = cursor_position() else {
        return;
    };
    let menu = CreatePopupMenu();
    if menu.is_null() {
        return;
    }
    let choose_label = wide("选择宠物…");
    let wake_label = wide("唤醒");
    let exit_label = wide("退出");
    AppendMenuW(menu, MF_STRING, MENU_OPEN_PICKER_ID, choose_label.as_ptr());
    AppendMenuW(menu, MF_SEPARATOR, 0, null());
    AppendMenuW(menu, MF_STRING, MENU_WAKE_ID, wake_label.as_ptr());
    AppendMenuW(menu, MF_STRING, MENU_EXIT_ID, exit_label.as_ptr());
    SetForegroundWindow(hwnd);
    let command = TrackPopupMenu(
        menu,
        TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON,
        cursor.x,
        cursor.y,
        0,
        hwnd,
        null(),
    );
    DestroyMenu(menu);
    match command as usize {
        MENU_OPEN_PICKER_ID => picker_window::show(hwnd),
        MENU_WAKE_ID => reveal_pet_window(hwnd),
        MENU_EXIT_ID => {
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
        }
        _ => {}
    }
}

unsafe fn show_context_menu(hwnd: HWND) {
    let Some(cursor) = cursor_position() else {
        return;
    };
    let menu = CreatePopupMenu();
    if menu.is_null() {
        return;
    }
    let choose_label = wide("选择宠物…");
    AppendMenuW(menu, MF_STRING, MENU_OPEN_PICKER_ID, choose_label.as_ptr());
    AppendMenuW(menu, MF_SEPARATOR, 0, null());
    let exit_label = wide(runtime_identity().map_or("退出桌宠", |identity| identity.exit_label));
    AppendMenuW(menu, MF_STRING, MENU_EXIT_ID, exit_label.as_ptr());
    SetForegroundWindow(hwnd);
    let command = TrackPopupMenu(
        menu,
        TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON,
        cursor.x,
        cursor.y,
        0,
        hwnd,
        null(),
    );
    DestroyMenu(menu);
    if command as usize == MENU_EXIT_ID {
        PostMessageW(hwnd, WM_CLOSE, 0, 0);
    } else if command as usize == MENU_OPEN_PICKER_ID {
        picker_window::show(hwnd);
    }
}

unsafe fn switch_pet(hwnd: HWND, runtime_id: &str) -> Result<bool, String> {
    let switched = load_and_commit_pet(runtime_id)?;
    if switched {
        fit_pet_window_to_current_size(hwnd);
        restart_animation(hwnd);
        show_bubble(hwnd, BubbleScene::PetSwitch);
    }
    Ok(switched)
}

fn load_and_commit_pet(runtime_id: &str) -> Result<bool, String> {
    let target = with_state(|state| -> Result<Option<(PathBuf, String)>, String> {
        if state.runtime.app.selected_pet_id() == Some(runtime_id) {
            return Ok(None);
        }
        let pet = state
            .runtime
            .app
            .pets
            .iter()
            .find(|pet| pet.runtime_id == runtime_id)
            .ok_or_else(|| format!("unknown pet id: {runtime_id}"))?;
        Ok(Some((
            pet.spritesheet.clone(),
            pet.manifest.display_name.clone(),
        )))
    })??;
    let Some((spritesheet, display_name)) = target else {
        return Ok(false);
    };

    let atlas = Atlas::decode_path(&spritesheet)
        .map_err(|error| format!("failed to decode {}: {error}", spritesheet.display()))?;

    with_state_mut(|state| -> Result<(), String> {
        let selected = select_pet(&state.runtime.paths, &mut state.runtime.app, runtime_id)
            .map_err(|error| format!("failed to persist pet selection: {error}"))?;
        if selected.is_none() {
            return Err(format!("pet disappeared before selection: {runtime_id}"));
        }
        state
            .runtime
            .picker
            .mark_confirmed(&state.runtime.app.pets, Some(runtime_id));
        state.atlas = atlas;
        state.pet_state = PetState::Jumping;
        state.frame_index = 0;
        state.rebuild_frames(state.dpi);
        Ok(())
    })??;
    log_event(&format!(
        "event=pet_switched id={} name={}",
        log_value(runtime_id),
        log_value(&display_name),
    ));
    Ok(true)
}

fn decode_runtime_atlas(
    paths: &AppPaths,
    app: &mut AppBootstrap,
) -> Result<(Atlas, desktop_pet_core::library::PetRecord), String> {
    let previous_selected_pet_id = app.selected_pet_id().map(str::to_string);
    let mut candidates = app.pets.clone();
    candidates.sort_by_key(|pet| {
        usize::from(previous_selected_pet_id.as_deref() != Some(pet.runtime_id.as_str()))
    });
    let decoded = match decode_first_valid_atlas(
        candidates
            .iter()
            .map(|pet| (pet.runtime_id.as_str(), pet.spritesheet.as_path())),
    ) {
        Ok(decoded) => decoded,
        Err(rejected) => {
            for failure in &rejected {
                log_event(&format!(
                    "event=pet_atlas_rejected id={} path={} error={}",
                    log_value(&failure.runtime_id),
                    log_value(&failure.path.display().to_string()),
                    log_value(&failure.detail),
                ));
            }
            return Err(format!(
                "no decodable pets are available in the writable pet library ({} rejected)",
                rejected.len(),
            ));
        }
    };
    for failure in &decoded.rejected {
        log_event(&format!(
            "event=pet_atlas_rejected id={} path={} error={}",
            log_value(&failure.runtime_id),
            log_value(&failure.path.display().to_string()),
            log_value(&failure.detail),
        ));
    }
    let selected = app
        .pets
        .iter()
        .find(|pet| pet.runtime_id == decoded.runtime_id)
        .cloned()
        .ok_or_else(|| format!("decoded pet disappeared: {}", decoded.runtime_id))?;
    if previous_selected_pet_id.as_deref() != Some(decoded.runtime_id.as_str()) {
        select_pet(paths, app, &decoded.runtime_id)
            .map_err(|error| format!("failed to persist decodable pet fallback: {error}"))?
            .ok_or_else(|| format!("decoded pet disappeared: {}", decoded.runtime_id))?;
        log_event(&format!(
            "event=pet_selection_fallback from={} to={}",
            previous_selected_pet_id
                .as_deref()
                .map_or_else(|| "none".to_string(), log_value),
            log_value(&decoded.runtime_id),
        ));
    }
    Ok((decoded.atlas, selected))
}

pub(super) unsafe fn reload_user_pet_library(hwnd: HWND) -> Result<(), String> {
    let (paths, mut next_app, previous_selected_pet_id) = with_state(|state| {
        Ok::<_, String>((
            state.runtime.paths.clone(),
            state.runtime.app.clone(),
            state.runtime.app.selected_pet_id().map(str::to_string),
        ))
    })??;
    refresh_pet_library(&paths, &mut next_app)
        .map_err(|error| format!("failed to refresh pet library: {error}"))?;
    for issue in &next_app.library_issues {
        log_event(&format!(
            "event=pet_library_issue severity={:?} kind={:?} folder={} detail={}",
            issue.severity,
            issue.kind,
            log_value(&issue.folder_name),
            log_value(&issue.detail),
        ));
    }

    let next_atlas = if next_app.pets.is_empty() {
        None
    } else {
        Some(decode_runtime_atlas(&paths, &mut next_app)?.0)
    };
    let next_selected_pet_id = next_app.selected_pet_id().map(str::to_string);
    let selected_changed = previous_selected_pet_id != next_selected_pet_id;
    let valid_runtime_ids = next_app
        .pets
        .iter()
        .map(|pet| pet.runtime_id.clone())
        .collect::<std::collections::HashSet<_>>();
    let pet_count = next_app.pets.len();

    with_state_mut(|state| {
        {
            state.runtime.app = next_app;
            state.runtime.picker.sync_pets(&state.runtime.app.pets);
            state
                .runtime
                .preview_cache
                .retain(|runtime_id, _| valid_runtime_ids.contains(runtime_id));
        }
        if let Some(atlas) = next_atlas {
            state.atlas = atlas;
            state.pet_state = if selected_changed {
                PetState::Jumping
            } else {
                PetState::Idle
            };
            state.frame_index = 0;
            state.rebuild_frames(state.dpi);
        }
        Ok::<_, String>(())
    })??;

    if with_state(|state| !state.frames.is_empty())? {
        fit_pet_window_to_current_size(hwnd);
        restart_animation(hwnd);
    }
    if selected_changed && next_selected_pet_id.is_some() {
        show_bubble(hwnd, BubbleScene::PetSwitch);
    }
    log_event(&format!(
        "event=pet_library_reloaded pets={pet_count} selected_changed={selected_changed}",
    ));
    Ok(())
}

unsafe fn fit_pet_window_to_current_size(hwnd: HWND) {
    let (Some(previous_rect), Ok(next_size)) =
        (window_rect(hwnd), with_state(|state| state.current_size()))
    else {
        return;
    };
    let center = PointI {
        x: previous_rect.left + (previous_rect.right - previous_rect.left) / 2,
        y: previous_rect.top + (previous_rect.bottom - previous_rect.top) / 2,
    };
    let Ok(work_area) = work_area_for(center) else {
        return;
    };
    let next_position = centered_resize_position(
        RectI {
            left: previous_rect.left,
            top: previous_rect.top,
            right: previous_rect.right,
            bottom: previous_rect.bottom,
        },
        next_size,
        work_area,
    );
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        next_position.x,
        next_position.y,
        next_size.width,
        next_size.height,
        SWP_NOACTIVATE,
    );
}

unsafe fn schedule_next_frame(hwnd: HWND) -> Result<(), String> {
    let duration_ms = with_state(|state| state.current_frame().duration_ms)?;
    if SetTimer(hwnd, FRAME_TIMER_ID, duration_ms.max(16), None) == 0 {
        return Err(last_error("SetTimer"));
    }
    Ok(())
}

unsafe fn present_current_frame(hwnd: HWND) -> Result<(), String> {
    let (frame, resize_handle_rect) = with_state(|state| {
        let show_resize_handle = state.tracking_hover
            || state
                .pointer
                .is_some_and(|pointer| pointer.resize_start_width.is_some());
        (
            state.current_frame().clone(),
            show_resize_handle.then_some(state.resize_handle_rect),
        )
    })?;
    if let Some(handle_rect) = resize_handle_rect {
        let rgba = draw_resize_handle(&frame.rgba, handle_rect);
        present_rgba(hwnd, &rgba)?;
    } else {
        present_rgba(hwnd, &frame.rgba)?;
    }
    apply_alpha_region(hwnd, &frame, resize_handle_rect)
}

unsafe fn present_rgba(hwnd: HWND, rgba: &RgbaImage) -> Result<(), String> {
    let width = rgba.width() as i32;
    let height = rgba.height() as i32;
    let screen_dc = GetDC(null_mut());
    if screen_dc.is_null() {
        return Err(last_error("GetDC"));
    }
    let memory_dc = CreateCompatibleDC(screen_dc);
    if memory_dc.is_null() {
        ReleaseDC(null_mut(), screen_dc);
        return Err(last_error("CreateCompatibleDC"));
    }

    let bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: (width * height * 4) as u32,
            ..BITMAPINFOHEADER::default()
        },
        ..BITMAPINFO::default()
    };
    let mut bitmap_bits: *mut c_void = null_mut();
    let bitmap = CreateDIBSection(
        memory_dc,
        &bitmap_info,
        DIB_RGB_COLORS,
        &mut bitmap_bits,
        null_mut(),
        0,
    );
    if bitmap.is_null() || bitmap_bits.is_null() {
        if !bitmap.is_null() {
            DeleteObject(bitmap);
        }
        DeleteDC(memory_dc);
        ReleaseDC(null_mut(), screen_dc);
        return Err(last_error("CreateDIBSection"));
    }

    let old_bitmap = SelectObject(memory_dc, bitmap);
    let premultiplied_bgra = premultiplied_bgra(rgba);
    copy_nonoverlapping(
        premultiplied_bgra.as_ptr(),
        bitmap_bits.cast::<u8>(),
        premultiplied_bgra.len(),
    );

    let rect = window_rect(hwnd).ok_or_else(|| last_error("GetWindowRect"))?;
    let destination = POINT {
        x: rect.left,
        y: rect.top,
    };
    let source = POINT { x: 0, y: 0 };
    let size = SIZE {
        cx: width,
        cy: height,
    };
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };
    let updated = UpdateLayeredWindow(
        hwnd,
        screen_dc,
        &destination,
        &size,
        memory_dc,
        &source,
        0,
        &blend,
        ULW_ALPHA,
    );
    let update_error = if updated == 0 {
        Some(last_error("UpdateLayeredWindow"))
    } else {
        None
    };

    SelectObject(memory_dc, old_bitmap);
    DeleteObject(bitmap);
    DeleteDC(memory_dc);
    ReleaseDC(null_mut(), screen_dc);
    update_error.map_or(Ok(()), Err)
}

unsafe fn apply_alpha_region(
    hwnd: HWND,
    frame: &RenderedFrame,
    resize_handle_rect: Option<RectI>,
) -> Result<(), String> {
    let region = CreateRectRgn(0, 0, 0, 0);
    if region.is_null() {
        return Err(last_error("CreateRectRgn"));
    }

    let width = frame.width();
    for y in 0..frame.height() {
        let mut x = 0;
        while x < width {
            while x < width && !frame.hit_test(x, y) {
                x += 1;
            }
            let start = x;
            while x < width && frame.hit_test(x, y) {
                x += 1;
            }
            if start == x {
                continue;
            }
            let span = CreateRectRgn(start as i32, y as i32, x as i32, y as i32 + 1);
            if span.is_null() {
                DeleteObject(region);
                return Err(last_error("CreateRectRgn(span)"));
            }
            let combine_result = CombineRgn(region, region, span, RGN_OR);
            DeleteObject(span);
            if combine_result == RGN_ERROR {
                DeleteObject(region);
                return Err(last_error("CombineRgn"));
            }
        }
    }

    if let Some(handle_rect) = resize_handle_rect {
        let handle = CreateRectRgn(
            handle_rect.left,
            handle_rect.top,
            handle_rect.right,
            handle_rect.bottom,
        );
        if handle.is_null() {
            DeleteObject(region);
            return Err(last_error("CreateRectRgn(resize handle)"));
        }
        let combine_result = CombineRgn(region, region, handle, RGN_OR);
        DeleteObject(handle);
        if combine_result == RGN_ERROR {
            DeleteObject(region);
            return Err(last_error("CombineRgn(resize handle)"));
        }
    }

    if SetWindowRgn(hwnd, region, 1) == 0 {
        DeleteObject(region);
        return Err(last_error("SetWindowRgn"));
    }
    // Windows owns the region after a successful SetWindowRgn call.
    Ok(())
}

fn draw_resize_handle(rgba: &RgbaImage, handle_rect: RectI) -> RgbaImage {
    let mut output = rgba.clone();
    let left = handle_rect.left.max(0) as u32;
    let top = handle_rect.top.max(0) as u32;
    let right = handle_rect
        .right
        .clamp(handle_rect.left, output.width() as i32) as u32;
    let bottom = handle_rect
        .bottom
        .clamp(handle_rect.top, output.height() as i32) as u32;
    let max_inset = (right - left).min(bottom - top);
    for inset in [6_u32, 11, 16] {
        if inset >= max_inset {
            continue;
        }
        for step in 0..inset.saturating_sub(3) {
            let x = right - inset + step;
            let y = bottom - 3 - step;
            if x < left || y < top || x >= right || y >= bottom {
                continue;
            }
            output.get_pixel_mut(x, y).0 = [70, 70, 70, 170];
            if y + 1 < bottom {
                output.get_pixel_mut(x, y + 1).0 = [70, 70, 70, 120];
            }
        }
    }
    output
}

fn premultiplied_bgra(rgba: &RgbaImage) -> Vec<u8> {
    let mut output = Vec::with_capacity((rgba.width() * rgba.height() * 4) as usize);
    for pixel in rgba.pixels() {
        let [red, green, blue, alpha] = pixel.0;
        let alpha_u16 = alpha as u16;
        output.push(((blue as u16 * alpha_u16 + 127) / 255) as u8);
        output.push(((green as u16 * alpha_u16 + 127) / 255) as u8);
        output.push(((red as u16 * alpha_u16 + 127) / 255) as u8);
        output.push(alpha);
    }
    output
}

unsafe fn initial_window_position(size: SizeI) -> Result<PointI, String> {
    let cursor = cursor_position().unwrap_or(PointI { x: 0, y: 0 });
    let work_area = work_area_for(cursor)?;
    Ok(PointI {
        x: work_area.left + work_area.width() - size.width - 48,
        y: work_area.top + work_area.height() - size.height - 48,
    })
}

unsafe fn work_area_for(point: PointI) -> Result<RectI, String> {
    let monitor = MonitorFromPoint(
        POINT {
            x: point.x,
            y: point.y,
        },
        MONITOR_DEFAULTTONEAREST,
    );
    if monitor.is_null() {
        return Err(last_error("MonitorFromPoint"));
    }
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..MONITORINFO::default()
    };
    if GetMonitorInfoW(monitor, &mut info) == 0 {
        return Err(last_error("GetMonitorInfoW"));
    }
    Ok(RectI {
        left: info.rcWork.left,
        top: info.rcWork.top,
        right: info.rcWork.right,
        bottom: info.rcWork.bottom,
    })
}

unsafe fn cursor_position() -> Option<PointI> {
    let mut point = POINT { x: 0, y: 0 };
    (GetCursorPos(&mut point) != 0).then_some(PointI {
        x: point.x,
        y: point.y,
    })
}

unsafe fn window_rect(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    (GetWindowRect(hwnd, &mut rect) != 0).then_some(rect)
}

fn with_state<T>(callback: impl FnOnce(&AppState) -> T) -> Result<T, String> {
    let state = APP_STATE
        .get()
        .ok_or_else(|| "native app state is unavailable".to_string())?;
    let state = state
        .lock()
        .map_err(|_| "native app state lock was poisoned".to_string())?;
    Ok(callback(&state))
}

fn with_state_mut<T>(callback: impl FnOnce(&mut AppState) -> T) -> Result<T, String> {
    let state = APP_STATE
        .get()
        .ok_or_else(|| "native app state is unavailable".to_string())?;
    let mut state = state
        .lock()
        .map_err(|_| "native app state lock was poisoned".to_string())?;
    Ok(callback(&mut state))
}

fn acquire_single_instance() -> Result<Option<OwnedHandle>, String> {
    let name = wide(runtime_identity()?.instance_mutex_name);
    let handle = unsafe { CreateMutexW(null(), 0, name.as_ptr()) };
    if handle.is_null() {
        return Err(last_error("CreateMutexW"));
    }
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe {
            CloseHandle(handle);
        }
        return Ok(None);
    }
    Ok(Some(OwnedHandle(handle)))
}

fn install_autostart() -> Result<PathBuf, String> {
    let identity = runtime_identity()?;
    let source = env::current_exe().map_err(|error| format!("current_exe failed: {error}"))?;
    let install_dir = runtime_data_directory(identity)?;
    fs::create_dir_all(&install_dir)
        .map_err(|error| format!("failed to create {}: {error}", install_dir.display()))?;
    let installed = install_dir.join(identity.installed_exe_name);
    if !same_path(&source, &installed) {
        fs::copy(&source, &installed).map_err(|error| {
            format!(
                "failed to copy {} to {}: {error}",
                source.display(),
                installed.display(),
            )
        })?;
    }
    set_run_key(&installed)?;
    log_event(&format!(
        "event=autostart_installed path={}",
        installed.display(),
    ));
    Ok(installed)
}

fn uninstall_autostart() -> Result<(), String> {
    let identity = runtime_identity()?;
    if remove_run_value(identity.autostart_value_name)? {
        log_event("event=autostart_uninstalled");
    }
    Ok(())
}

fn remove_legacy_electron_autostart() -> Result<(), String> {
    for value_name in LEGACY_ELECTRON_AUTOSTART_VALUE_NAMES {
        if remove_run_value(value_name)? {
            log_event(&format!(
                "event=legacy_autostart_removed name={}",
                log_value(value_name),
            ));
        }
    }
    Ok(())
}

fn remove_run_value(value_name: &str) -> Result<bool, String> {
    let run_key = wide(AUTOSTART_RUN_KEY);
    let value_name = wide(value_name);
    let mut key: HKEY = null_mut();
    let open_status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            run_key.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut key,
        )
    };
    if open_status == ERROR_FILE_NOT_FOUND {
        return Ok(false);
    }
    if open_status != ERROR_SUCCESS {
        return Err(format!("RegOpenKeyExW failed with {open_status}"));
    }
    let delete_status = unsafe { RegDeleteValueW(key, value_name.as_ptr()) };
    unsafe {
        RegCloseKey(key);
    }
    if delete_status != ERROR_SUCCESS && delete_status != ERROR_FILE_NOT_FOUND {
        return Err(format!("RegDeleteValueW failed with {delete_status}"));
    }
    Ok(delete_status == ERROR_SUCCESS)
}

fn set_run_key(executable: &Path) -> Result<(), String> {
    let identity = runtime_identity()?;
    let run_key = wide(AUTOSTART_RUN_KEY);
    let value_name = wide(identity.autostart_value_name);
    let command = wide(format!("\"{}\" --autostart", executable.display()));
    let mut key: HKEY = null_mut();
    let open_status = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            run_key.as_ptr(),
            0,
            null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            null(),
            &mut key,
            null_mut(),
        )
    };
    if open_status != ERROR_SUCCESS {
        return Err(format!("RegCreateKeyExW failed with {open_status}"));
    }
    let data = unsafe {
        std::slice::from_raw_parts(
            command.as_ptr().cast::<u8>(),
            command.len() * size_of::<u16>(),
        )
    };
    let set_status = unsafe {
        RegSetValueExW(
            key,
            value_name.as_ptr(),
            0,
            REG_SZ,
            data.as_ptr(),
            data.len() as u32,
        )
    };
    unsafe {
        RegCloseKey(key);
    }
    if set_status != ERROR_SUCCESS {
        return Err(format!("RegSetValueExW failed with {set_status}"));
    }
    Ok(())
}

fn local_app_data_dir() -> Result<PathBuf, String> {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "LOCALAPPDATA is unavailable".to_string())
}

fn legacy_electron_data_directory() -> Option<PathBuf> {
    let app_data = env::var_os("APPDATA").map(PathBuf::from)?;
    ["desktop-pet-mvp", "Desktop Pet MVP"]
        .into_iter()
        .map(|folder| app_data.join(folder))
        .find(|path| path.is_dir())
}

fn runtime_data_directory(identity: &RuntimeIdentity) -> Result<PathBuf, String> {
    Ok(local_app_data_dir()?.join(identity.data_directory_name))
}

fn runtime_identity() -> Result<&'static RuntimeIdentity, String> {
    RUNTIME_IDENTITY
        .get()
        .copied()
        .ok_or_else(|| "native runtime identity is unavailable".to_string())
}

fn set_launch_at_login_enabled(enabled: bool) -> Result<(), String> {
    let previous = with_state(|state| state.runtime.app.preferences.launch_at_login)?;
    if previous == enabled {
        return Ok(());
    }

    if enabled {
        install_autostart()?;
    } else {
        uninstall_autostart()?;
    }
    let persist_result = with_state_mut(|state| -> Result<(), String> {
        persist_launch_at_login(&state.runtime.paths, &mut state.runtime.app, enabled)
            .map_err(|error| format!("failed to persist launch-at-login: {error}"))
    })?;
    if let Err(error) = persist_result {
        if previous {
            let _ = install_autostart();
        } else {
            let _ = uninstall_autostart();
        }
        return Err(error);
    }
    log_event(&format!("event=launch_at_login_changed enabled={enabled}"));
    Ok(())
}

unsafe fn open_pet_library(owner: HWND) -> Result<(), String> {
    let pets_root = with_state(|state| state.runtime.paths.pets_root.clone())?;
    fs::create_dir_all(&pets_root)
        .map_err(|error| format!("failed to create {}: {error}", pets_root.display()))?;
    let operation = wide("open");
    let path = wide(pets_root.as_os_str());
    let result = ShellExecuteW(
        owner,
        operation.as_ptr(),
        path.as_ptr(),
        null(),
        null(),
        SW_SHOWNORMAL,
    );
    if result as isize <= 32 {
        return Err(format!(
            "failed to open {}: ShellExecuteW returned {}",
            pets_root.display(),
            result as isize,
        ));
    }
    log_event(&format!(
        "event=pet_library_opened path={}",
        log_value(&pets_root.display().to_string()),
    ));
    Ok(())
}

fn pet_preview_rgba(runtime_id: &str) -> Result<Arc<RgbaImage>, String> {
    if let Some(cached) = with_state(|state| state.runtime.preview_cache.get(runtime_id).cloned())?
    {
        return Ok(cached);
    }
    let spritesheet = with_state(|state| {
        state
            .runtime
            .app
            .pets
            .iter()
            .find(|pet| pet.runtime_id == runtime_id)
            .map(|pet| pet.spritesheet.clone())
    })?
    .ok_or_else(|| format!("unknown pet preview id: {runtime_id}"))?;
    let atlas = Atlas::decode_path(&spritesheet).map_err(|error| {
        format!(
            "failed to decode preview {}: {error}",
            spritesheet.display()
        )
    })?;
    let preview = atlas
        .render_sequence(PetState::Idle, 96, 96, true)
        .frames
        .into_iter()
        .next()
        .map(|frame| frame.rgba)
        .ok_or_else(|| format!("preview animation is empty for {runtime_id}"))?;
    with_state_mut(|state| {
        state
            .runtime
            .preview_cache
            .insert(runtime_id.to_string(), preview.clone());
    })?;
    Ok(preview)
}

fn persist_current_mascot_width() {
    let Ok(identity) = runtime_identity() else {
        return;
    };
    let Ok(width) = with_state(|state| state.logical_width) else {
        return;
    };
    let result = (|| -> Result<(), String> {
        let data_root = runtime_data_directory(identity)?;
        let paths = AppPaths::for_data_root(data_root);
        let mut preferences = load_preferences(&paths.preferences_file)
            .map_err(|error| format!("failed to read preferences: {error}"))?;
        preferences.mascot_width_px = Some(width);
        save_preferences(&paths.preferences_file, &preferences)
            .map_err(|error| format!("failed to save preferences: {error}"))
    })();
    match result {
        Ok(()) => log_event(&format!("event=mascot_width_saved width={width}")),
        Err(error) => log_event(&format!(
            "event=mascot_width_save_error error={}",
            log_value(&error),
        )),
    }
}

fn log_event(message: &str) {
    let Ok(identity) = runtime_identity() else {
        return;
    };
    let Ok(directory) = runtime_data_directory(identity) else {
        return;
    };
    if fs::create_dir_all(&directory).is_err() {
        return;
    }
    let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join(identity.log_file_name))
    else {
        return;
    };
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let _ = writeln!(file, "timestamp_ms={timestamp_ms} {message}");
}

fn log_value(value: &str) -> String {
    value.replace(['\r', '\n', ' '], "_")
}

fn same_path(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

fn wide(value: impl AsRef<OsStr>) -> Vec<u16> {
    value.as_ref().encode_wide().chain(Some(0)).collect()
}

fn last_error(operation: &str) -> String {
    format!("{operation} failed with Win32 error {}", unsafe {
        GetLastError()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn premultiplies_rgba_into_windows_bgra_order() {
        let rgba = RgbaImage::from_raw(1, 1, vec![200, 100, 50, 128]).unwrap();
        assert_eq!(premultiplied_bgra(&rgba), vec![25, 50, 100, 128]);
    }
}
