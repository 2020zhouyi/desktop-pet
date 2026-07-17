pub const MIN_MASCOT_WIDTH: i32 = 84;
pub const MAX_MASCOT_WIDTH: i32 = 228;
pub const DEFAULT_MASCOT_WIDTH: i32 = 120;
pub const MASCOT_WIDTH_STEP: i32 = 12;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PointI {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SizeI {
    pub width: i32,
    pub height: i32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RectI {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl RectI {
    pub fn width(self) -> i32 {
        self.right - self.left
    }

    pub fn height(self) -> i32 {
        self.bottom - self.top
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DragSession {
    pub pointer_offset: PointI,
}

pub fn physical_px(logical_px: i32, dpi: u32) -> i32 {
    let dpi = dpi.max(96) as i64;
    ((logical_px as i64 * dpi + 48) / 96) as i32
}

pub fn scaled_size(logical_width: i32, source_size: SizeI, dpi: u32) -> SizeI {
    let width = physical_px(logical_width, dpi).max(1);
    let height = ((width as i64 * source_size.height as i64 + source_size.width as i64 / 2)
        / source_size.width.max(1) as i64) as i32;
    SizeI {
        width,
        height: height.max(1),
    }
}

pub fn drag_position(
    cursor: PointI,
    session: DragSession,
    window_size: SizeI,
    work_area: RectI,
) -> PointI {
    let unclamped = PointI {
        x: cursor.x - session.pointer_offset.x,
        y: cursor.y - session.pointer_offset.y,
    };
    PointI {
        x: clamp_axis(
            unclamped.x,
            work_area.left,
            work_area.left + work_area.width() - window_size.width,
        ),
        y: clamp_axis(
            unclamped.y,
            work_area.top,
            work_area.top + work_area.height() - window_size.height,
        ),
    }
}

pub fn centered_resize_position(
    previous_bounds: RectI,
    next_size: SizeI,
    work_area: RectI,
) -> PointI {
    let centered = PointI {
        x: (((f64::from(previous_bounds.left) + f64::from(previous_bounds.right))
            - f64::from(next_size.width))
            / 2.0)
            .round() as i32,
        y: (((f64::from(previous_bounds.top) + f64::from(previous_bounds.bottom))
            - f64::from(next_size.height))
            / 2.0)
            .round() as i32,
    };
    PointI {
        x: clamp_axis(
            centered.x,
            work_area.left,
            work_area.right - next_size.width,
        ),
        y: clamp_axis(
            centered.y,
            work_area.top,
            work_area.bottom - next_size.height,
        ),
    }
}

pub fn bubble_position(
    pet_bounds: RectI,
    bubble_size: SizeI,
    work_area: RectI,
    gap: i32,
) -> PointI {
    let gap = gap.max(0);
    let centered_x = pet_bounds.left + (pet_bounds.width() - bubble_size.width) / 2;
    let above_y = pet_bounds.top - gap - bubble_size.height;
    let below_y = pet_bounds.bottom + gap;
    let y = if above_y >= work_area.top {
        above_y
    } else {
        below_y
    };
    PointI {
        x: clamp_axis(
            centered_x,
            work_area.left,
            work_area.right - bubble_size.width,
        ),
        y: clamp_axis(y, work_area.top, work_area.bottom - bubble_size.height),
    }
}

pub fn rescale_drag_session(
    session: DragSession,
    previous_size: SizeI,
    next_size: SizeI,
) -> DragSession {
    DragSession {
        pointer_offset: PointI {
            x: rescale_offset(
                session.pointer_offset.x,
                previous_size.width,
                next_size.width,
            ),
            y: rescale_offset(
                session.pointer_offset.y,
                previous_size.height,
                next_size.height,
            ),
        },
    }
}

pub fn snap_mascot_width(value: f64) -> i32 {
    if !value.is_finite() {
        return DEFAULT_MASCOT_WIDTH;
    }
    ((value / f64::from(MASCOT_WIDTH_STEP)).round() as i32 * MASCOT_WIDTH_STEP)
        .clamp(MIN_MASCOT_WIDTH, MAX_MASCOT_WIDTH)
}

fn rescale_offset(offset: i32, previous_extent: i32, next_extent: i32) -> i32 {
    if previous_extent <= 0 || next_extent <= 0 {
        return 0;
    }
    let scaled =
        (offset as i64 * next_extent as i64 + previous_extent as i64 / 2) / previous_extent as i64;
    scaled.clamp(0, next_extent.saturating_sub(1) as i64) as i32
}

fn clamp_axis(value: i32, minimum: i32, maximum: i32) -> i32 {
    if maximum < minimum {
        return minimum;
    }
    value.clamp(minimum, maximum)
}
