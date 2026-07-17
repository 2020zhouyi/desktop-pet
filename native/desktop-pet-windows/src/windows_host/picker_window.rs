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
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, CreateSolidBrush, DEFAULT_GUI_FONT, DIB_RGB_COLORS,
    DT_CENTER, DT_END_ELLIPSIS, DT_NOPREFIX, DT_SINGLELINE, DT_VCENTER, DeleteObject, DrawTextW,
    FillRect, FrameRect, GetStockObject, InvalidateRect, SRCCOPY, SetBkMode, SetTextColor,
    StretchDIBits, TRANSPARENT, WHITE_BRUSH,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Controls::{
    BST_CHECKED, BST_UNCHECKED, DRAWITEMSTRUCT, ODS_FOCUS, ODS_SELECTED,
};
use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{EnableWindow, SetFocus};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    BM_GETCHECK, BM_SETCHECK, BN_CLICKED, BS_AUTOCHECKBOX, BS_DEFPUSHBUTTON, BS_OWNERDRAW,
    BS_PUSHBUTTON, CS_HREDRAW, CS_VREDRAW, CreateWindowExW, DefWindowProcW, DestroyWindow,
    EN_CHANGE, ES_AUTOHSCROLL, GW_OWNER, GetClientRect, GetDlgItem, GetWindow,
    GetWindowTextLengthW, GetWindowTextW, IDC_ARROW, IDCANCEL, IsDialogMessageW, LoadCursorW, MSG,
    MoveWindow, RegisterClassW, SW_HIDE, SW_SHOW, SW_SHOWNORMAL, SWP_NOACTIVATE, SendMessageW,
    SetForegroundWindow, SetWindowPos, SetWindowTextW, ShowWindow, WA_INACTIVE, WM_ACTIVATE,
    WM_CLOSE, WM_COMMAND, WM_CREATE, WM_DESTROY, WM_DPICHANGED, WM_DRAWITEM, WM_SETFONT, WM_SIZE,
    WNDCLASSW, WS_BORDER, WS_CAPTION, WS_CHILD, WS_DISABLED, WS_EX_CONTROLPARENT, WS_EX_TOOLWINDOW,
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
    let window_class = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        hInstance: instance,
        hCursor: LoadCursorW(null_mut(), IDC_ARROW),
        hbrBackground: GetStockObject(WHITE_BRUSH),
        lpszClassName: class_name.as_ptr(),
        ..WNDCLASSW::default()
    };
    if RegisterClassW(&window_class) == 0 {
        return Err(last_error("RegisterClassW(picker)"));
    }
    Ok(())
}

pub(super) unsafe fn show(owner: HWND) {
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
            x: (center.x - width / 2).clamp(work_area.left, work_area.right - width),
            y: (center.y - height / 2).clamp(work_area.top, work_area.bottom - height),
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
        owner,
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
                let owner = GetWindow(hwnd, GW_OWNER);
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
            layout_controls(hwnd);
            refresh(hwnd);
            0
        }
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
            layout_controls(hwnd);
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
        WS_VISIBLE | WS_TABSTOP | WS_BORDER | ES_AUTOHSCROLL as u32,
        CONTROL_SEARCH,
    );
    create_control(
        hwnd,
        "BUTTON",
        "开机自启",
        WS_VISIBLE | WS_TABSTOP | BS_AUTOCHECKBOX as u32,
        CONTROL_LAUNCH,
    );
    create_control(
        hwnd,
        "BUTTON",
        "管理宠物",
        WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON as u32,
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
        WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON as u32,
        CONTROL_PREVIOUS,
    );
    create_control(hwnd, "STATIC", "0 / 0", WS_VISIBLE, CONTROL_PAGE);
    create_control(
        hwnd,
        "BUTTON",
        "→",
        WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON as u32,
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
        WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON as u32,
        CONTROL_CONFIRM,
    );
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
    let header_height = scale(82);
    let footer_height = scale(128);
    let grid_top = margin + header_height;
    let grid_bottom = (height - footer_height).max(grid_top + scale(120));
    let grid_width = (width - margin * 2).max(scale(400));
    let card_width = (grid_width - gap * 3) / 4;
    let card_height = (grid_bottom - grid_top - gap) / 2;

    move_control(
        hwnd,
        CONTROL_TITLE,
        margin,
        scale(14),
        scale(360),
        scale(28),
    );
    move_control(
        hwnd,
        CONTROL_TOTAL,
        width - margin - scale(180),
        scale(16),
        scale(180),
        scale(24),
    );
    move_control(
        hwnd,
        CONTROL_SEARCH,
        margin,
        scale(50),
        (width - margin * 2 - scale(340)).max(scale(260)),
        scale(34),
    );
    move_control(
        hwnd,
        CONTROL_LAUNCH,
        width - margin - scale(322),
        scale(50),
        scale(142),
        scale(34),
    );
    move_control(
        hwnd,
        CONTROL_MANAGE,
        width - margin - scale(164),
        scale(50),
        scale(164),
        scale(34),
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
        margin,
        height - scale(80),
        scale(64),
        scale(64),
    );
    move_control(
        hwnd,
        CONTROL_DETAIL,
        margin + scale(80),
        height - scale(66),
        (width - margin * 2 - scale(270)).max(scale(220)),
        scale(52),
    );
    move_control(
        hwnd,
        CONTROL_CONFIRM,
        width - margin - scale(170),
        height - scale(68),
        scale(170),
        scale(44),
    );
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
                let owner = GetWindow(hwnd, GW_OWNER);
                if !owner.is_null() {
                    switch_pet(owner, &runtime_id);
                }
            }
            refresh(hwnd);
        }
        CONTROL_LAUNCH => {
            let checkbox = GetDlgItem(hwnd, CONTROL_LAUNCH);
            let enabled = SendMessageW(checkbox, BM_GETCHECK, 0, 0) == BST_CHECKED as isize;
            if let Err(error) = set_launch_at_login_enabled(enabled) {
                log_event(&format!("event=launch_at_login_error error={error}"));
            }
            refresh(hwnd);
        }
        CONTROL_MANAGE => {
            if let Err(error) = open_pet_library() {
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

unsafe fn draw_card(item: &DRAWITEMSTRUCT, card: &PickerCard) {
    let pressed = item.itemState & ODS_SELECTED != 0;
    let background = if pressed {
        (238, 238, 238)
    } else if card.draft {
        (244, 251, 249)
    } else {
        (255, 255, 255)
    };
    fill_rect(item.hDC, &item.rcItem, background);
    frame_rect(
        item.hDC,
        &item.rcItem,
        if card.draft {
            (16, 163, 127)
        } else if card.confirmed {
            (112, 112, 112)
        } else {
            (229, 229, 229)
        },
    );

    let status = if card.confirmed {
        "桌面中"
    } else if card.draft {
        "已预览"
    } else {
        ""
    };
    if !status.is_empty() {
        let mut status_bounds = RECT {
            left: item.rcItem.left + 8,
            top: item.rcItem.top + 5,
            right: item.rcItem.right - 8,
            bottom: item.rcItem.top + 24,
        };
        draw_text(
            item.hDC,
            status,
            &mut status_bounds,
            if card.draft {
                (10, 122, 94)
            } else {
                (80, 80, 80)
            },
            DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
        );
    }

    let preview_bounds = RECT {
        left: item.rcItem.left + 10,
        top: item.rcItem.top + 23,
        right: item.rcItem.right - 10,
        bottom: item.rcItem.bottom - 50,
    };
    draw_pet_preview(item.hDC, &preview_bounds, &card.runtime_id, background);

    let mut name_bounds = RECT {
        left: item.rcItem.left + 8,
        top: item.rcItem.bottom - 48,
        right: item.rcItem.right - 8,
        bottom: item.rcItem.bottom - 26,
    };
    draw_text(
        item.hDC,
        &card.display_name,
        &mut name_bounds,
        (32, 32, 32),
        DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX,
    );
    let mut caption_bounds = RECT {
        left: item.rcItem.left + 8,
        top: item.rcItem.bottom - 27,
        right: item.rcItem.right - 8,
        bottom: item.rcItem.bottom - 6,
    };
    draw_text(
        item.hDC,
        &card.caption,
        &mut caption_bounds,
        (105, 105, 105),
        DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX,
    );
    if item.itemState & ODS_FOCUS != 0 {
        let focus = RECT {
            left: item.rcItem.left + 3,
            top: item.rcItem.top + 3,
            right: item.rcItem.right - 3,
            bottom: item.rcItem.bottom - 3,
        };
        frame_rect(item.hDC, &focus, (32, 32, 32));
    }
}

unsafe fn draw_preview_panel(item: &DRAWITEMSTRUCT, card: Option<&PickerCard>) {
    fill_rect(item.hDC, &item.rcItem, (247, 247, 248));
    frame_rect(item.hDC, &item.rcItem, (229, 229, 229));
    let bounds = RECT {
        left: item.rcItem.left + 4,
        top: item.rcItem.top + 4,
        right: item.rcItem.right - 4,
        bottom: item.rcItem.bottom - 4,
    };
    if let Some(card) = card {
        draw_pet_preview(item.hDC, &bounds, &card.runtime_id, (247, 247, 248));
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
        draw_text(
            device,
            "?",
            &mut placeholder,
            (128, 128, 128),
            DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
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
            biSizeImage: (preview.width() * preview.height() * 4) as u32,
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

unsafe fn fill_rect(device: *mut c_void, bounds: &RECT, color: (u8, u8, u8)) {
    let brush = CreateSolidBrush(color_ref(color));
    if !brush.is_null() {
        FillRect(device, bounds, brush);
        DeleteObject(brush);
    }
}

unsafe fn frame_rect(device: *mut c_void, bounds: &RECT, color: (u8, u8, u8)) {
    let brush = CreateSolidBrush(color_ref(color));
    if !brush.is_null() {
        FrameRect(device, bounds, brush);
        DeleteObject(brush);
    }
}

unsafe fn draw_text(
    device: *mut c_void,
    text: &str,
    bounds: &mut RECT,
    color: (u8, u8, u8),
    format: u32,
) {
    SetBkMode(device, TRANSPARENT as i32);
    SetTextColor(device, color_ref(color));
    let text = wide(text);
    DrawTextW(device, text.as_ptr(), -1, bounds, format);
}

fn color_ref((red, green, blue): (u8, u8, u8)) -> u32 {
    u32::from(red) | (u32::from(green) << 8) | (u32::from(blue) << 16)
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
    SendMessageW(
        GetDlgItem(hwnd, CONTROL_LAUNCH),
        BM_SETCHECK,
        if snapshot.launch_at_login {
            BST_CHECKED as usize
        } else {
            BST_UNCHECKED as usize
        },
        0,
    );
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
