mod theme;

use self::theme::{
    ACCENT, ACCENT_HOVER, ACCENT_SOFT, BORDER, BORDER_STRONG, CURRENT_SOFT, Color, SURFACE,
    SURFACE_HOVER, SURFACE_MUTED, TEXT_DISABLED, TEXT_PRIMARY, TEXT_SECONDARY, WINDOW_BACKGROUND,
    color_ref, create_ui_font, rounded_box,
};
use super::{
    PointI, last_error, log_event, open_pet_library, pet_preview_rgba, physical_px,
    reload_user_pet_library, set_launch_at_login_enabled, switch_pet, wide, window_rect,
    with_state, with_state_mut, work_area_for,
};
use desktop_pet_core::library::PetRecord;
use std::ffi::c_void;
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicUsize, Ordering};
use windows_sys::Win32::Foundation::{HINSTANCE, HWND, RECT};
use windows_sys::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BeginPaint, CreatePen, CreateSolidBrush,
    DEFAULT_GUI_FONT, DIB_RGB_COLORS, DT_CENTER, DT_END_ELLIPSIS, DT_LEFT, DT_NOPREFIX,
    DT_SINGLELINE, DT_VCENTER, DeleteObject, DrawFocusRect, DrawTextW, Ellipse, EndPaint,
    FW_NORMAL, FW_SEMIBOLD, FillRect, GetStockObject, HOLLOW_BRUSH, InvalidateRect, LineTo,
    MoveToEx, PAINTSTRUCT, PS_SOLID, SRCCOPY, SelectObject, SetBkColor, SetBkMode, SetTextColor,
    StretchDIBits, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Controls::{
    DRAWITEMSTRUCT, EM_SETCUEBANNER, ODS_DISABLED, ODS_FOCUS, ODS_HOTLIGHT, ODS_SELECTED,
};
use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{EnableWindow, SetFocus};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    BN_CLICKED, BS_OWNERDRAW, CS_HREDRAW, CS_VREDRAW, CreateWindowExW, DefWindowProcW,
    DestroyWindow, EN_CHANGE, ES_AUTOHSCROLL, GetClientRect, GetDlgCtrlID, GetDlgItem,
    GetWindowTextLengthW, GetWindowTextW, HWND_NOTOPMOST, IDC_ARROW, IDCANCEL, IsDialogMessageW,
    LoadCursorW, MSG, MoveWindow, RegisterClassW, SW_HIDE, SW_SHOW, SW_SHOWNORMAL, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SendMessageW, SetForegroundWindow, SetWindowPos, SetWindowTextW,
    ShowWindow, WA_INACTIVE, WM_ACTIVATE, WM_CLOSE, WM_COMMAND, WM_CREATE, WM_CTLCOLOREDIT,
    WM_CTLCOLORSTATIC, WM_DESTROY, WM_DPICHANGED, WM_DRAWITEM, WM_ERASEBKGND, WM_PAINT, WM_SETFONT,
    WM_SIZE, WNDCLASSW, WS_CAPTION, WS_CHILD, WS_DISABLED, WS_EX_CONTROLPARENT, WS_EX_TOOLWINDOW,
    WS_MINIMIZEBOX, WS_OVERLAPPED, WS_SYSMENU, WS_TABSTOP, WS_VISIBLE,
};

const CLASS_NAME: &str = "DesktopPetPickerWindow";
const WINDOW_WIDTH_LOGICAL: i32 = 920;
const WINDOW_HEIGHT_LOGICAL: i32 = 680;
const CONTROL_TITLE: i32 = 101;
const CONTROL_TOTAL: i32 = 102;
const CONTROL_SEARCH: i32 = 103;
const CONTROL_LAUNCH: i32 = 104;
const CONTROL_MANAGE: i32 = 105;
const CONTROL_PREVIOUS: i32 = 106;
const CONTROL_PAGE: i32 = 107;
const CONTROL_NEXT: i32 = 108;
const CONTROL_DETAIL: i32 = 109;
const CONTROL_CONFIRM: i32 = 110;
const CONTROL_DETAIL_PREVIEW: i32 = 111;
const CONTROL_CARD_BASE: i32 = 200;
const CARD_COUNT: usize = 8;

static PICKER_HWND: AtomicUsize = AtomicUsize::new(0);
static PICKER_OWNER_HWND: AtomicUsize = AtomicUsize::new(0);
static BACKGROUND_BRUSH: AtomicUsize = AtomicUsize::new(0);
static SURFACE_BRUSH: AtomicUsize = AtomicUsize::new(0);
static FONT_TITLE: AtomicUsize = AtomicUsize::new(0);
static FONT_BODY: AtomicUsize = AtomicUsize::new(0);
static FONT_BODY_STRONG: AtomicUsize = AtomicUsize::new(0);
static FONT_SMALL: AtomicUsize = AtomicUsize::new(0);

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct PickerCard {
    runtime_id: String,
    display_name: String,
    caption: String,
    confirmed: bool,
    draft: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct PickerSnapshot {
    total_count: usize,
    filtered_count: usize,
    page_index: usize,
    page_count: usize,
    cards: Vec<PickerCard>,
    draft: Option<PickerCard>,
    detail: String,
    confirmation_candidate: Option<String>,
    launch_at_login: bool,
}

pub(super) unsafe fn register(instance: HINSTANCE) -> Result<(), String> {
    let class_name = wide(CLASS_NAME);
    let background_brush = CreateSolidBrush(color_ref(WINDOW_BACKGROUND));
    let surface_brush = CreateSolidBrush(color_ref(SURFACE));
    if background_brush.is_null() || surface_brush.is_null() {
        if !background_brush.is_null() {
            DeleteObject(background_brush);
        }
        if !surface_brush.is_null() {
            DeleteObject(surface_brush);
        }
        return Err(last_error("CreateSolidBrush(picker)"));
    }
    let window_class = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        hInstance: instance,
        hCursor: LoadCursorW(null_mut(), IDC_ARROW),
        hbrBackground: background_brush,
        lpszClassName: class_name.as_ptr(),
        ..WNDCLASSW::default()
    };
    if RegisterClassW(&window_class) == 0 {
        DeleteObject(background_brush);
        DeleteObject(surface_brush);
        return Err(last_error("RegisterClassW(picker)"));
    }
    BACKGROUND_BRUSH.store(background_brush as usize, Ordering::Release);
    SURFACE_BRUSH.store(surface_brush as usize, Ordering::Release);
    Ok(())
}

pub(super) unsafe fn show(owner: HWND) {
    PICKER_OWNER_HWND.store(owner as usize, Ordering::Release);
    let existing = PICKER_HWND.load(Ordering::Acquire) as HWND;
    if !existing.is_null() {
        refresh(existing);
        ShowWindow(existing, SW_SHOWNORMAL);
        SetForegroundWindow(existing);
        return;
    }

    let instance = GetModuleHandleW(null());
    if instance.is_null() {
        log_event(&format!(
            "event=picker_open_error error={}",
            last_error("GetModuleHandleW(picker)"),
        ));
        return;
    }
    let dpi = GetDpiForWindow(owner).max(96);
    let width = physical_px(WINDOW_WIDTH_LOGICAL, dpi);
    let height = physical_px(WINDOW_HEIGHT_LOGICAL, dpi);
    let owner_rect = window_rect(owner).unwrap_or(RECT {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
    });
    let center = PointI {
        x: owner_rect.left + (owner_rect.right - owner_rect.left) / 2,
        y: owner_rect.top + (owner_rect.bottom - owner_rect.top) / 2,
    };
    let position = work_area_for(center)
        .map(|work_area| PointI {
            x: (center.x - width / 2).clamp(
                work_area.left,
                (work_area.right - width).max(work_area.left),
            ),
            y: (center.y - height / 2).clamp(
                work_area.top,
                (work_area.bottom - height).max(work_area.top),
            ),
        })
        .unwrap_or(PointI { x: 64, y: 64 });
    let class_name = wide(CLASS_NAME);
    let title = wide("选择桌宠");
    let hwnd = CreateWindowExW(
        WS_EX_TOOLWINDOW | WS_EX_CONTROLPARENT,
        class_name.as_ptr(),
        title.as_ptr(),
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
        position.x,
        position.y,
        width,
        height,
        null_mut(),
        null_mut(),
        instance,
        null(),
    );
    if hwnd.is_null() {
        log_event(&format!(
            "event=picker_open_error error={}",
            last_error("CreateWindowExW(picker)"),
        ));
        return;
    }
    PICKER_HWND.store(hwnd as usize, Ordering::Release);
    layout_controls(hwnd);
    refresh(hwnd);
    ShowWindow(hwnd, SW_SHOWNORMAL);
    SetForegroundWindow(hwnd);
    SetFocus(GetDlgItem(hwnd, CONTROL_SEARCH));
    log_event("event=picker_opened");
}

pub(super) unsafe fn handle_dialog_message(message: &mut MSG) -> bool {
    let hwnd = PICKER_HWND.load(Ordering::Acquire) as HWND;
    !hwnd.is_null() && IsDialogMessageW(hwnd, message) != 0
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    match message {
        WM_ACTIVATE => {
            if low_word(wparam) != WA_INACTIVE as i32 {
                let owner = PICKER_OWNER_HWND.load(Ordering::Acquire) as HWND;
                if !owner.is_null()
                    && let Err(error) = reload_user_pet_library(owner)
                {
                    log_event(&format!("event=pet_library_reload_error error={error}",));
                }
                refresh(hwnd);
            }
            0
        }
        WM_CREATE => {
            create_controls(hwnd);
            install_fonts(hwnd, GetDpiForWindow(hwnd).max(96));
            layout_controls(hwnd);
            refresh(hwnd);
            0
        }
        WM_ERASEBKGND => 1,
        WM_PAINT => {
            paint_window(hwnd);
            0
        }
        WM_CTLCOLOREDIT => paint_control_background(wparam, lparam, true),
        WM_CTLCOLORSTATIC => paint_control_background(wparam, lparam, false),
        WM_SIZE => {
            layout_controls(hwnd);
            0
        }
        WM_DPICHANGED => {
            if lparam != 0 {
                let suggested = *(lparam as *const RECT);
                SetWindowPos(
                    hwnd,
                    null_mut(),
                    suggested.left,
                    suggested.top,
                    suggested.right - suggested.left,
                    suggested.bottom - suggested.top,
                    SWP_NOACTIVATE,
                );
            }
            install_fonts(hwnd, GetDpiForWindow(hwnd).max(96));
            layout_controls(hwnd);
            InvalidateRect(hwnd, null(), 1);
            0
        }
        WM_COMMAND => {
            handle_command(hwnd, low_word(wparam), high_word(wparam));
            0
        }
        WM_DRAWITEM => {
            if lparam != 0 && draw_item(&*(lparam as *const DRAWITEMSTRUCT)) {
                1
            } else {
                DefWindowProcW(hwnd, message, wparam, lparam)
            }
        }
        WM_CLOSE => {
            DestroyWindow(hwnd);
            0
        }
        WM_DESTROY => {
            PICKER_HWND.store(0, Ordering::Release);
            PICKER_OWNER_HWND.store(0, Ordering::Release);
            release_fonts();
            log_event("event=picker_closed");
            0
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}

unsafe fn create_controls(hwnd: HWND) {
    create_control(hwnd, "STATIC", "选择桌宠", WS_VISIBLE, CONTROL_TITLE);
    create_control(hwnd, "STATIC", "", WS_VISIBLE, CONTROL_TOTAL);
    create_control(
        hwnd,
        "EDIT",
        "",
        WS_VISIBLE | WS_TABSTOP | ES_AUTOHSCROLL as u32,
        CONTROL_SEARCH,
    );
    create_control(
        hwnd,
        "BUTTON",
        "开机自启",
        WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW as u32,
        CONTROL_LAUNCH,
    );
    create_control(
        hwnd,
        "BUTTON",
        "管理宠物",
        WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW as u32,
        CONTROL_MANAGE,
    );
    for index in 0..CARD_COUNT {
        create_control(
            hwnd,
            "BUTTON",
            "",
            WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW as u32,
            CONTROL_CARD_BASE + index as i32,
        );
    }
    create_control(
        hwnd,
        "BUTTON",
        "←",
        WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW as u32,
        CONTROL_PREVIOUS,
    );
    create_control(hwnd, "STATIC", "0 / 0", WS_VISIBLE, CONTROL_PAGE);
    create_control(
        hwnd,
        "BUTTON",
        "→",
        WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW as u32,
        CONTROL_NEXT,
    );
    create_control(
        hwnd,
        "BUTTON",
        "当前桌宠预览",
        WS_VISIBLE | WS_DISABLED | BS_OWNERDRAW as u32,
        CONTROL_DETAIL_PREVIEW,
    );
    create_control(hwnd, "STATIC", "", WS_VISIBLE, CONTROL_DETAIL);
    create_control(
        hwnd,
        "BUTTON",
        "确认使用",
        WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW as u32,
        CONTROL_CONFIRM,
    );
    let search = GetDlgItem(hwnd, CONTROL_SEARCH);
    let cue = wide("搜索伙伴名称或 ID");
    SendMessageW(search, EM_SETCUEBANNER, 1, cue.as_ptr() as isize);
}

unsafe fn create_control(hwnd: HWND, class: &str, text: &str, style: u32, id: i32) -> HWND {
    let class = wide(class);
    let text = wide(text);
    let instance = GetModuleHandleW(null());
    let control = CreateWindowExW(
        0,
        class.as_ptr(),
        text.as_ptr(),
        WS_CHILD | style,
        0,
        0,
        1,
        1,
        hwnd,
        id as usize as *mut c_void,
        instance,
        null(),
    );
    if !control.is_null() {
        SendMessageW(
            control,
            WM_SETFONT,
            GetStockObject(DEFAULT_GUI_FONT) as usize,
            1,
        );
    }
    control
}

unsafe fn install_fonts(hwnd: HWND, dpi: u32) {
    replace_font(&FONT_TITLE, create_ui_font(dpi, 22, FW_SEMIBOLD));
    replace_font(&FONT_BODY, create_ui_font(dpi, 14, FW_NORMAL));
    replace_font(&FONT_BODY_STRONG, create_ui_font(dpi, 14, FW_SEMIBOLD));
    replace_font(&FONT_SMALL, create_ui_font(dpi, 12, FW_NORMAL));

    set_control_font(hwnd, CONTROL_TITLE, FONT_TITLE.load(Ordering::Acquire));
    set_control_font(hwnd, CONTROL_TOTAL, FONT_SMALL.load(Ordering::Acquire));
    set_control_font(hwnd, CONTROL_SEARCH, FONT_BODY.load(Ordering::Acquire));
    set_control_font(
        hwnd,
        CONTROL_LAUNCH,
        FONT_BODY_STRONG.load(Ordering::Acquire),
    );
    set_control_font(
        hwnd,
        CONTROL_MANAGE,
        FONT_BODY_STRONG.load(Ordering::Acquire),
    );
    set_control_font(hwnd, CONTROL_PREVIOUS, FONT_BODY.load(Ordering::Acquire));
    set_control_font(hwnd, CONTROL_PAGE, FONT_SMALL.load(Ordering::Acquire));
    set_control_font(hwnd, CONTROL_NEXT, FONT_BODY.load(Ordering::Acquire));
    set_control_font(hwnd, CONTROL_DETAIL, FONT_BODY.load(Ordering::Acquire));
    set_control_font(
        hwnd,
        CONTROL_CONFIRM,
        FONT_BODY_STRONG.load(Ordering::Acquire),
    );
    for index in 0..CARD_COUNT {
        set_control_font(
            hwnd,
            CONTROL_CARD_BASE + index as i32,
            FONT_BODY.load(Ordering::Acquire),
        );
    }
}

unsafe fn replace_font(target: &AtomicUsize, font: *mut c_void) {
    if font.is_null() {
        return;
    }
    let previous = target.swap(font as usize, Ordering::AcqRel) as *mut c_void;
    if !previous.is_null() {
        DeleteObject(previous);
    }
}

unsafe fn set_control_font(hwnd: HWND, id: i32, font: usize) {
    if font == 0 {
        return;
    }
    let control = GetDlgItem(hwnd, id);
    if !control.is_null() {
        SendMessageW(control, WM_SETFONT, font, 1);
    }
}

unsafe fn release_fonts() {
    for font in [&FONT_TITLE, &FONT_BODY, &FONT_BODY_STRONG, &FONT_SMALL] {
        let handle = font.swap(0, Ordering::AcqRel) as *mut c_void;
        if !handle.is_null() {
            DeleteObject(handle);
        }
    }
}

unsafe fn paint_window(hwnd: HWND) {
    let mut paint = PAINTSTRUCT::default();
    let device = BeginPaint(hwnd, &mut paint);
    if device.is_null() {
        return;
    }
    let mut client = RECT::default();
    if GetClientRect(hwnd, &mut client) != 0 {
        let background = BACKGROUND_BRUSH.load(Ordering::Acquire) as *mut c_void;
        if !background.is_null() {
            FillRect(device, &client, background);
        }
        let dpi = GetDpiForWindow(hwnd).max(96);
        let scale = |value| physical_px(value, dpi);
        let width = client.right - client.left;
        let height = client.bottom - client.top;
        let margin = scale(24);
        let search_width = (width - margin * 2 - scale(340)).max(scale(260));
        let search = RECT {
            left: margin,
            top: scale(50),
            right: margin + search_width,
            bottom: scale(90),
        };
        rounded_box(device, &search, SURFACE, BORDER, scale(12), scale(1));
        draw_search_icon(device, &search, dpi);

        let footer = RECT {
            left: margin,
            top: height - scale(98),
            right: width - margin,
            bottom: height - scale(14),
        };
        rounded_box(device, &footer, SURFACE, BORDER, scale(14), scale(1));
    }
    EndPaint(hwnd, &paint);
}

unsafe fn draw_search_icon(device: *mut c_void, bounds: &RECT, dpi: u32) {
    let scale = |value| physical_px(value, dpi);
    let pen = CreatePen(PS_SOLID, scale(2).max(1), color_ref(TEXT_SECONDARY));
    if pen.is_null() {
        return;
    }
    let previous_pen = SelectObject(device, pen);
    let previous_brush = SelectObject(device, GetStockObject(HOLLOW_BRUSH));
    let center_x = bounds.left + scale(20);
    let center_y = bounds.top + (bounds.bottom - bounds.top) / 2 - scale(2);
    let radius = scale(6);
    Ellipse(
        device,
        center_x - radius,
        center_y - radius,
        center_x + radius,
        center_y + radius,
    );
    MoveToEx(device, center_x + scale(4), center_y + scale(4), null_mut());
    LineTo(device, center_x + scale(9), center_y + scale(9));
    SelectObject(device, previous_brush);
    SelectObject(device, previous_pen);
    DeleteObject(pen);
}

unsafe fn paint_control_background(wparam: usize, lparam: isize, edit: bool) -> isize {
    let device = wparam as *mut c_void;
    let control = lparam as HWND;
    let id = if control.is_null() {
        0
    } else {
        GetDlgCtrlID(control)
    };
    let on_surface = edit || id == CONTROL_DETAIL;
    let background = if on_surface {
        SURFACE
    } else {
        WINDOW_BACKGROUND
    };
    SetBkMode(device, TRANSPARENT as i32);
    SetBkColor(device, color_ref(background));
    SetTextColor(
        device,
        color_ref(if id == CONTROL_TOTAL || id == CONTROL_PAGE {
            TEXT_SECONDARY
        } else {
            TEXT_PRIMARY
        }),
    );
    if on_surface {
        SURFACE_BRUSH.load(Ordering::Acquire) as isize
    } else {
        BACKGROUND_BRUSH.load(Ordering::Acquire) as isize
    }
}

unsafe fn layout_controls(hwnd: HWND) {
    let mut client = RECT::default();
    if GetClientRect(hwnd, &mut client) == 0 {
        return;
    }
    let dpi = GetDpiForWindow(hwnd).max(96);
    let scale = |value| physical_px(value, dpi);
    let width = client.right - client.left;
    let height = client.bottom - client.top;
    let margin = scale(24);
    let gap = scale(12);
    let header_height = scale(90);
    let footer_height = scale(150);
    let grid_top = margin + header_height;
    let grid_bottom = (height - footer_height).max(grid_top + scale(120));
    let grid_width = (width - margin * 2).max(scale(400));
    let card_width = (grid_width - gap * 3) / 4;
    let card_height = (grid_bottom - grid_top - gap) / 2;

    move_control(
        hwnd,
        CONTROL_TITLE,
        margin,
        scale(16),
        scale(360),
        scale(30),
    );
    move_control(
        hwnd,
        CONTROL_TOTAL,
        width - margin - scale(180),
        scale(20),
        scale(180),
        scale(24),
    );
    let search_shell_width = (width - margin * 2 - scale(340)).max(scale(260));
    move_control(
        hwnd,
        CONTROL_SEARCH,
        margin + scale(40),
        scale(54),
        search_shell_width - scale(50),
        scale(32),
    );
    move_control(
        hwnd,
        CONTROL_LAUNCH,
        width - margin - scale(322),
        scale(50),
        scale(142),
        scale(40),
    );
    move_control(
        hwnd,
        CONTROL_MANAGE,
        width - margin - scale(164),
        scale(50),
        scale(164),
        scale(40),
    );
    for index in 0..CARD_COUNT {
        let column = index % 4;
        let row = index / 4;
        move_control(
            hwnd,
            CONTROL_CARD_BASE + index as i32,
            margin + column as i32 * (card_width + gap),
            grid_top + row as i32 * (card_height + gap),
            card_width,
            card_height,
        );
    }

    let pager_y = grid_bottom + scale(12);
    move_control(
        hwnd,
        CONTROL_PREVIOUS,
        margin,
        pager_y,
        scale(52),
        scale(32),
    );
    move_control(
        hwnd,
        CONTROL_PAGE,
        margin + scale(64),
        pager_y + scale(7),
        scale(96),
        scale(22),
    );
    move_control(
        hwnd,
        CONTROL_NEXT,
        margin + scale(166),
        pager_y,
        scale(52),
        scale(32),
    );
    move_control(
        hwnd,
        CONTROL_DETAIL_PREVIEW,
        margin + scale(12),
        height - scale(86),
        scale(64),
        scale(64),
    );
    move_control(
        hwnd,
        CONTROL_DETAIL,
        margin + scale(92),
        height - scale(72),
        (width - margin * 2 - scale(296)).max(scale(220)),
        scale(52),
    );
    move_control(
        hwnd,
        CONTROL_CONFIRM,
        width - margin - scale(178),
        height - scale(75),
        scale(166),
        scale(46),
    );
    InvalidateRect(hwnd, null(), 1);
}

unsafe fn move_control(hwnd: HWND, id: i32, x: i32, y: i32, width: i32, height: i32) {
    let control = GetDlgItem(hwnd, id);
    if !control.is_null() {
        MoveWindow(control, x, y, width.max(1), height.max(1), 1);
    }
}

unsafe fn handle_command(hwnd: HWND, control_id: i32, notification: u16) {
    if control_id == IDCANCEL {
        DestroyWindow(hwnd);
        return;
    }
    if control_id == CONTROL_SEARCH && notification == EN_CHANGE as u16 {
        let query = window_text(GetDlgItem(hwnd, CONTROL_SEARCH));
        let _ = with_state_mut(|state| {
            state.runtime.picker.set_query(query);
        });
        refresh(hwnd);
        return;
    }
    if notification != BN_CLICKED as u16 {
        return;
    }

    match control_id {
        CONTROL_PREVIOUS => {
            let _ = with_state_mut(|state| {
                state.runtime.picker.previous_page(&state.runtime.app.pets);
            });
            refresh(hwnd);
        }
        CONTROL_NEXT => {
            let _ = with_state_mut(|state| {
                state.runtime.picker.next_page(&state.runtime.app.pets);
            });
            refresh(hwnd);
        }
        CONTROL_CONFIRM => {
            let candidate = with_state(|state| {
                state
                    .runtime
                    .picker
                    .confirmation_candidate(&state.runtime.app.pets)
                    .map(str::to_string)
            })
            .ok()
            .flatten();
            if let Some(runtime_id) = candidate {
                let owner = PICKER_OWNER_HWND.load(Ordering::Acquire) as HWND;
                if !owner.is_null() {
                    match switch_pet(owner, &runtime_id) {
                        Ok(_) => {
                            DestroyWindow(hwnd);
                            return;
                        }
                        Err(error) => log_event(&format!(
                            "event=pet_switch_error id={runtime_id} error={error}",
                        )),
                    }
                }
            }
            refresh(hwnd);
        }
        CONTROL_LAUNCH => {
            let enabled = !snapshot().launch_at_login;
            if let Err(error) = set_launch_at_login_enabled(enabled) {
                log_event(&format!("event=launch_at_login_error error={error}"));
            }
            refresh(hwnd);
        }
        CONTROL_MANAGE => {
            SetWindowPos(
                hwnd,
                HWND_NOTOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
            SetForegroundWindow(hwnd);
            if let Err(error) = open_pet_library(hwnd) {
                log_event(&format!("event=pet_library_open_error error={error}"));
            }
        }
        id if (CONTROL_CARD_BASE..CONTROL_CARD_BASE + CARD_COUNT as i32).contains(&id) => {
            let index = (id - CONTROL_CARD_BASE) as usize;
            if let Some(card) = snapshot().cards.get(index).cloned() {
                let _ = with_state_mut(|state| {
                    state
                        .runtime
                        .picker
                        .preview_pet(&state.runtime.app.pets, &card.runtime_id);
                });
            }
            refresh(hwnd);
        }
        _ => {}
    }
}

unsafe fn draw_item(item: &DRAWITEMSTRUCT) -> bool {
    let control_id = item.CtlID as i32;
    let snapshot = snapshot();
    if control_id == CONTROL_LAUNCH {
        draw_launch_toggle(item, snapshot.launch_at_login);
        return true;
    }
    if matches!(
        control_id,
        CONTROL_MANAGE | CONTROL_PREVIOUS | CONTROL_NEXT | CONTROL_CONFIRM
    ) {
        draw_action_button(item, control_id, &snapshot);
        return true;
    }
    if control_id == CONTROL_DETAIL_PREVIEW {
        draw_preview_panel(item, snapshot.draft.as_ref());
        return true;
    }
    if !(CONTROL_CARD_BASE..CONTROL_CARD_BASE + CARD_COUNT as i32).contains(&control_id) {
        return false;
    }
    let index = (control_id - CONTROL_CARD_BASE) as usize;
    if let Some(card) = snapshot.cards.get(index) {
        draw_card(item, card);
    }
    true
}

unsafe fn draw_action_button(item: &DRAWITEMSTRUCT, control_id: i32, snapshot: &PickerSnapshot) {
    let dpi = GetDpiForWindow(item.hwndItem).max(96);
    let scale = |value| physical_px(value, dpi);
    let pressed = item.itemState & ODS_SELECTED != 0;
    let hot = item.itemState & ODS_HOTLIGHT != 0;
    let disabled = item.itemState & ODS_DISABLED != 0;
    let primary = control_id == CONTROL_CONFIRM;
    let (fill, border, text_color) = if disabled {
        (SURFACE_MUTED, BORDER, TEXT_DISABLED)
    } else if primary {
        (
            if pressed || hot { ACCENT_HOVER } else { ACCENT },
            if pressed || hot { ACCENT_HOVER } else { ACCENT },
            (255, 255, 255),
        )
    } else {
        (
            if pressed {
                SURFACE_MUTED
            } else if hot {
                SURFACE_HOVER
            } else {
                SURFACE
            },
            if hot { BORDER_STRONG } else { BORDER },
            TEXT_PRIMARY,
        )
    };
    rounded_box(
        item.hDC,
        &item.rcItem,
        fill,
        border,
        scale(if primary { 12 } else { 10 }),
        scale(1),
    );
    let label = match control_id {
        CONTROL_MANAGE => "管理宠物",
        CONTROL_PREVIOUS => "‹",
        CONTROL_NEXT => "›",
        CONTROL_CONFIRM if snapshot.confirmation_candidate.is_some() => "确认使用",
        CONTROL_CONFIRM => "正在使用",
        _ => "",
    };
    let mut text_bounds = item.rcItem;
    draw_text_with_font(
        item.hDC,
        label,
        &mut text_bounds,
        text_color,
        DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
        if primary || control_id == CONTROL_MANAGE {
            FONT_BODY_STRONG.load(Ordering::Acquire)
        } else {
            FONT_BODY.load(Ordering::Acquire)
        },
    );
    if item.itemState & ODS_FOCUS != 0 {
        let focus = inset_rect(item.rcItem, scale(4));
        DrawFocusRect(item.hDC, &focus);
    }
}

unsafe fn draw_launch_toggle(item: &DRAWITEMSTRUCT, enabled: bool) {
    let dpi = GetDpiForWindow(item.hwndItem).max(96);
    let scale = |value| physical_px(value, dpi);
    let hot = item.itemState & ODS_HOTLIGHT != 0;
    let pressed = item.itemState & ODS_SELECTED != 0;
    rounded_box(
        item.hDC,
        &item.rcItem,
        if hot || pressed {
            SURFACE_HOVER
        } else {
            SURFACE
        },
        if hot { BORDER_STRONG } else { BORDER },
        scale(10),
        scale(1),
    );
    let track_width = scale(38);
    let track_height = scale(20);
    let track = RECT {
        left: item.rcItem.right - track_width - scale(10),
        top: item.rcItem.top + (item.rcItem.bottom - item.rcItem.top - track_height) / 2,
        right: item.rcItem.right - scale(10),
        bottom: item.rcItem.top
            + (item.rcItem.bottom - item.rcItem.top - track_height) / 2
            + track_height,
    };
    rounded_box(
        item.hDC,
        &track,
        if enabled { ACCENT } else { SURFACE_MUTED },
        if enabled { ACCENT } else { BORDER_STRONG },
        track_height,
        scale(1),
    );
    let thumb_size = scale(14);
    let thumb_left = if enabled {
        track.right - scale(3) - thumb_size
    } else {
        track.left + scale(3)
    };
    let thumb_top = track.top + (track_height - thumb_size) / 2;
    let thumb = RECT {
        left: thumb_left,
        top: thumb_top,
        right: thumb_left + thumb_size,
        bottom: thumb_top + thumb_size,
    };
    rounded_box(
        item.hDC,
        &thumb,
        (255, 255, 255),
        (255, 255, 255),
        thumb_size,
        scale(1),
    );
    let mut label_bounds = RECT {
        left: item.rcItem.left + scale(12),
        top: item.rcItem.top,
        right: track.left - scale(8),
        bottom: item.rcItem.bottom,
    };
    draw_text_with_font(
        item.hDC,
        "开机自启",
        &mut label_bounds,
        TEXT_PRIMARY,
        DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
        FONT_BODY.load(Ordering::Acquire),
    );
    if item.itemState & ODS_FOCUS != 0 {
        let focus = inset_rect(item.rcItem, scale(4));
        DrawFocusRect(item.hDC, &focus);
    }
}

unsafe fn draw_card(item: &DRAWITEMSTRUCT, card: &PickerCard) {
    let dpi = GetDpiForWindow(item.hwndItem).max(96);
    let scale = |value| physical_px(value, dpi);
    let pressed = item.itemState & ODS_SELECTED != 0;
    let hot = item.itemState & ODS_HOTLIGHT != 0;
    let background = if pressed {
        SURFACE_MUTED
    } else if card.draft {
        ACCENT_SOFT
    } else if hot {
        SURFACE_HOVER
    } else {
        SURFACE
    };
    let border = if card.draft {
        ACCENT
    } else if card.confirmed || hot {
        BORDER_STRONG
    } else {
        BORDER
    };
    rounded_box(
        item.hDC,
        &item.rcItem,
        background,
        border,
        scale(14),
        scale(if card.draft { 2 } else { 1 }),
    );

    if card.confirmed || card.draft {
        let status = if card.draft { "待确认" } else { "桌面中" };
        let status_width = scale(62);
        let status_bounds = RECT {
            left: item.rcItem.left + scale(10),
            top: item.rcItem.top + scale(9),
            right: item.rcItem.left + scale(10) + status_width,
            bottom: item.rcItem.top + scale(31),
        };
        rounded_box(
            item.hDC,
            &status_bounds,
            if card.draft { ACCENT } else { CURRENT_SOFT },
            if card.draft { ACCENT } else { BORDER },
            scale(11),
            scale(1),
        );
        let mut status_bounds = RECT {
            left: status_bounds.left + scale(4),
            top: status_bounds.top,
            right: status_bounds.right - scale(4),
            bottom: status_bounds.bottom,
        };
        draw_text_with_font(
            item.hDC,
            status,
            &mut status_bounds,
            if card.draft {
                (255, 255, 255)
            } else {
                TEXT_SECONDARY
            },
            DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
            FONT_SMALL.load(Ordering::Acquire),
        );
    }

    let preview_bounds = RECT {
        left: item.rcItem.left + scale(12),
        top: item.rcItem.top + scale(36),
        right: item.rcItem.right - scale(12),
        bottom: item.rcItem.bottom - scale(56),
    };
    draw_pet_preview(item.hDC, &preview_bounds, &card.runtime_id, background);

    let mut name_bounds = RECT {
        left: item.rcItem.left + scale(10),
        top: item.rcItem.bottom - scale(54),
        right: item.rcItem.right - scale(10),
        bottom: item.rcItem.bottom - scale(29),
    };
    draw_text_with_font(
        item.hDC,
        &card.display_name,
        &mut name_bounds,
        TEXT_PRIMARY,
        DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX,
        FONT_BODY_STRONG.load(Ordering::Acquire),
    );
    let mut caption_bounds = RECT {
        left: item.rcItem.left + scale(10),
        top: item.rcItem.bottom - scale(30),
        right: item.rcItem.right - scale(10),
        bottom: item.rcItem.bottom - scale(8),
    };
    draw_text_with_font(
        item.hDC,
        &card.caption,
        &mut caption_bounds,
        TEXT_SECONDARY,
        DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX,
        FONT_SMALL.load(Ordering::Acquire),
    );
    if item.itemState & ODS_FOCUS != 0 {
        let focus = inset_rect(item.rcItem, scale(4));
        DrawFocusRect(item.hDC, &focus);
    }
}

unsafe fn draw_preview_panel(item: &DRAWITEMSTRUCT, card: Option<&PickerCard>) {
    let dpi = GetDpiForWindow(item.hwndItem).max(96);
    let scale = |value| physical_px(value, dpi);
    rounded_box(
        item.hDC,
        &item.rcItem,
        SURFACE_MUTED,
        BORDER,
        scale(12),
        scale(1),
    );
    let bounds = RECT {
        left: item.rcItem.left + scale(5),
        top: item.rcItem.top + scale(5),
        right: item.rcItem.right - scale(5),
        bottom: item.rcItem.bottom - scale(5),
    };
    if let Some(card) = card {
        draw_pet_preview(item.hDC, &bounds, &card.runtime_id, SURFACE_MUTED);
    }
}

unsafe fn draw_pet_preview(
    device: *mut c_void,
    bounds: &RECT,
    runtime_id: &str,
    background: (u8, u8, u8),
) {
    let Ok(preview) = pet_preview_rgba(runtime_id) else {
        let mut placeholder = *bounds;
        draw_text_with_font(
            device,
            "?",
            &mut placeholder,
            TEXT_SECONDARY,
            DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
            FONT_BODY_STRONG.load(Ordering::Acquire),
        );
        return;
    };
    let available_width = (bounds.right - bounds.left).max(1);
    let available_height = (bounds.bottom - bounds.top).max(1);
    let mut target_width = available_width;
    let mut target_height = ((i64::from(target_width) * i64::from(preview.height())
        + i64::from(preview.width()) / 2)
        / i64::from(preview.width().max(1))) as i32;
    if target_height > available_height {
        target_height = available_height;
        target_width = ((i64::from(target_height) * i64::from(preview.width())
            + i64::from(preview.height()) / 2)
            / i64::from(preview.height().max(1))) as i32;
    }
    let x = bounds.left + (available_width - target_width) / 2;
    let y = bounds.top + (available_height - target_height) / 2;
    let pixels = composited_bgra(&preview, background);
    let bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: preview.width() as i32,
            biHeight: -(preview.height() as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: preview.width() * preview.height() * 4,
            ..BITMAPINFOHEADER::default()
        },
        ..BITMAPINFO::default()
    };
    StretchDIBits(
        device,
        x,
        y,
        target_width,
        target_height,
        0,
        0,
        preview.width() as i32,
        preview.height() as i32,
        pixels.as_ptr().cast(),
        &bitmap_info,
        DIB_RGB_COLORS,
        SRCCOPY,
    );
}

fn composited_bgra(preview: &desktop_pet_render::RgbaImage, background: (u8, u8, u8)) -> Vec<u8> {
    let mut pixels = Vec::with_capacity((preview.width() * preview.height() * 4) as usize);
    for pixel in preview.pixels() {
        let [red, green, blue, alpha] = pixel.0;
        let inverse_alpha = 255_u16 - u16::from(alpha);
        let composite = |foreground: u8, background: u8| {
            ((u16::from(foreground) * u16::from(alpha)
                + u16::from(background) * inverse_alpha
                + 127)
                / 255) as u8
        };
        pixels.push(composite(blue, background.2));
        pixels.push(composite(green, background.1));
        pixels.push(composite(red, background.0));
        pixels.push(255);
    }
    pixels
}

unsafe fn draw_text_with_font(
    device: *mut c_void,
    text: &str,
    bounds: &mut RECT,
    color: Color,
    format: u32,
    font: usize,
) {
    let previous = if font == 0 {
        null_mut()
    } else {
        SelectObject(device, font as *mut c_void)
    };
    SetBkMode(device, TRANSPARENT as i32);
    SetTextColor(device, color_ref(color));
    let text = wide(text);
    DrawTextW(device, text.as_ptr(), -1, bounds, format);
    if !previous.is_null() {
        SelectObject(device, previous);
    }
}

fn inset_rect(bounds: RECT, amount: i32) -> RECT {
    RECT {
        left: bounds.left + amount,
        top: bounds.top + amount,
        right: bounds.right - amount,
        bottom: bounds.bottom - amount,
    }
}

unsafe fn refresh(hwnd: HWND) {
    let snapshot = snapshot();
    set_text(
        GetDlgItem(hwnd, CONTROL_TOTAL),
        &format!("{} 位伙伴", snapshot.total_count),
    );
    let page_text = if snapshot.filtered_count == 0 {
        "0 / 0".to_string()
    } else {
        format!("{} / {}", snapshot.page_index + 1, snapshot.page_count)
    };
    set_text(GetDlgItem(hwnd, CONTROL_PAGE), &page_text);
    EnableWindow(
        GetDlgItem(hwnd, CONTROL_PREVIOUS),
        i32::from(snapshot.page_index > 0),
    );
    EnableWindow(
        GetDlgItem(hwnd, CONTROL_NEXT),
        i32::from(snapshot.page_index + 1 < snapshot.page_count),
    );

    for index in 0..CARD_COUNT {
        let control = GetDlgItem(hwnd, CONTROL_CARD_BASE + index as i32);
        if let Some(card) = snapshot.cards.get(index) {
            let status = if card.confirmed {
                "✓ 桌面中"
            } else if card.draft {
                "● 已预览"
            } else {
                ""
            };
            let label = if status.is_empty() {
                format!("{}\r\n{}", card.display_name, card.caption)
            } else {
                format!("{status}\r\n{}\r\n{}", card.display_name, card.caption)
            };
            set_text(control, &label);
            ShowWindow(control, SW_SHOW);
            EnableWindow(control, 1);
            InvalidateRect(control, null(), 1);
        } else {
            set_text(control, "");
            ShowWindow(control, SW_HIDE);
        }
    }

    InvalidateRect(GetDlgItem(hwnd, CONTROL_DETAIL_PREVIEW), null(), 1);
    set_text(GetDlgItem(hwnd, CONTROL_DETAIL), &snapshot.detail);
    let confirm = GetDlgItem(hwnd, CONTROL_CONFIRM);
    set_text(
        confirm,
        if snapshot.confirmation_candidate.is_some() {
            "确认使用"
        } else {
            "正在使用"
        },
    );
    EnableWindow(
        confirm,
        i32::from(snapshot.confirmation_candidate.is_some()),
    );
    InvalidateRect(GetDlgItem(hwnd, CONTROL_LAUNCH), null(), 1);
}

fn snapshot() -> PickerSnapshot {
    with_state(|state| {
        let runtime = &state.runtime;
        let view = runtime.picker.view(&runtime.app.pets);
        let confirmation_candidate = runtime
            .picker
            .confirmation_candidate(&runtime.app.pets)
            .map(str::to_string);
        let cards = view
            .visible_pets
            .iter()
            .map(|pet| picker_card(pet, view.confirmed_pet_id, view.draft_pet_id))
            .collect();
        let draft = view.draft_pet_id.and_then(|runtime_id| {
            runtime
                .app
                .pets
                .iter()
                .find(|pet| pet.runtime_id == runtime_id)
        });
        let detail = draft.map_or_else(
            || "没有可用桌宠，请检查宠物资源目录。".to_string(),
            |pet| {
                let prefix = if confirmation_candidate.is_some() {
                    "准备切换"
                } else {
                    "当前桌宠"
                };
                let secondary = [
                    pet.manifest.faction.as_deref(),
                    pet.manifest.author.as_deref(),
                ]
                .into_iter()
                .flatten()
                .take(2)
                .collect::<Vec<_>>()
                .join(" · ");
                if secondary.is_empty() {
                    format!("{prefix}：{}", pet.manifest.display_name)
                } else {
                    format!("{prefix}：{}\r\n{secondary}", pet.manifest.display_name)
                }
            },
        );
        let draft = draft.map(|pet| picker_card(pet, view.confirmed_pet_id, view.draft_pet_id));
        PickerSnapshot {
            total_count: runtime.app.pets.len(),
            filtered_count: view.filtered_count,
            page_index: view.page_index,
            page_count: view.page_count,
            cards,
            draft,
            detail,
            confirmation_candidate,
            launch_at_login: runtime.app.preferences.launch_at_login,
        }
    })
    .unwrap_or_default()
}

fn picker_card(
    pet: &PetRecord,
    confirmed_pet_id: Option<&str>,
    draft_pet_id: Option<&str>,
) -> PickerCard {
    PickerCard {
        runtime_id: pet.runtime_id.clone(),
        display_name: pet.manifest.display_name.clone(),
        caption: pet
            .manifest
            .faction
            .as_ref()
            .or_else(|| pet.manifest.tags.as_ref().and_then(|tags| tags.first()))
            .or(pet.manifest.author.as_ref())
            .cloned()
            .unwrap_or_else(|| "桌面伙伴".to_string()),
        confirmed: confirmed_pet_id == Some(pet.runtime_id.as_str()),
        draft: draft_pet_id == Some(pet.runtime_id.as_str()),
    }
}

unsafe fn window_text(hwnd: HWND) -> String {
    if hwnd.is_null() {
        return String::new();
    }
    let length = GetWindowTextLengthW(hwnd);
    if length <= 0 {
        return String::new();
    }
    let mut buffer = vec![0_u16; length as usize + 1];
    let copied = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
    String::from_utf16_lossy(&buffer[..copied.max(0) as usize])
}

unsafe fn set_text(hwnd: HWND, text: &str) {
    if !hwnd.is_null() {
        let text = wide(text);
        SetWindowTextW(hwnd, text.as_ptr());
    }
}

fn low_word(value: usize) -> i32 {
    (value & 0xffff) as i32
}

fn high_word(value: usize) -> u16 {
    ((value >> 16) & 0xffff) as u16
}
