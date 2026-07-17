use super::super::{physical_px, wide};
use std::ffi::c_void;
use windows_sys::Win32::Foundation::RECT;
use windows_sys::Win32::Graphics::Gdi::{
    CLEARTYPE_QUALITY, CLIP_DEFAULT_PRECIS, CreateFontW, CreatePen, CreateSolidBrush,
    DEFAULT_CHARSET, DEFAULT_PITCH, DeleteObject, FF_DONTCARE, OUT_DEFAULT_PRECIS, PS_SOLID,
    RoundRect, SelectObject,
};

pub(super) type Color = (u8, u8, u8);

pub(super) const WINDOW_BACKGROUND: Color = (246, 243, 236);
pub(super) const SURFACE: Color = (255, 253, 249);
pub(super) const SURFACE_MUTED: Color = (239, 235, 226);
pub(super) const SURFACE_HOVER: Color = (250, 248, 242);
pub(super) const BORDER: Color = (218, 211, 199);
pub(super) const BORDER_STRONG: Color = (184, 175, 161);
pub(super) const TEXT_PRIMARY: Color = (42, 38, 33);
pub(super) const TEXT_SECONDARY: Color = (105, 96, 84);
pub(super) const TEXT_DISABLED: Color = (150, 143, 132);
pub(super) const ACCENT: Color = (24, 135, 103);
pub(super) const ACCENT_HOVER: Color = (18, 118, 89);
pub(super) const ACCENT_SOFT: Color = (230, 245, 239);
pub(super) const CURRENT_SOFT: Color = (237, 233, 225);

pub(super) fn color_ref((red, green, blue): Color) -> u32 {
    u32::from(red) | (u32::from(green) << 8) | (u32::from(blue) << 16)
}

pub(super) unsafe fn create_ui_font(dpi: u32, logical_height: i32, weight: u32) -> *mut c_void {
    let face = wide("Segoe UI");
    CreateFontW(
        -physical_px(logical_height, dpi),
        0,
        0,
        0,
        weight as i32,
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

pub(super) unsafe fn rounded_box(
    device: *mut c_void,
    bounds: &RECT,
    fill: Color,
    border: Color,
    radius: i32,
    border_width: i32,
) {
    let brush = CreateSolidBrush(color_ref(fill));
    let pen = CreatePen(PS_SOLID, border_width.max(1), color_ref(border));
    if brush.is_null() || pen.is_null() {
        if !brush.is_null() {
            DeleteObject(brush);
        }
        if !pen.is_null() {
            DeleteObject(pen);
        }
        return;
    }
    let previous_brush = SelectObject(device, brush);
    let previous_pen = SelectObject(device, pen);
    RoundRect(
        device,
        bounds.left,
        bounds.top,
        bounds.right,
        bounds.bottom,
        radius,
        radius,
    );
    SelectObject(device, previous_pen);
    SelectObject(device, previous_brush);
    DeleteObject(pen);
    DeleteObject(brush);
}
