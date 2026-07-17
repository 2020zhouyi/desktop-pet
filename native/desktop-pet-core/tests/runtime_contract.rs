use desktop_pet_core::animation::{
    ATLAS_COLUMNS, ATLAS_ROWS, CELL_HEIGHT, CELL_WIDTH, action_duration_ms, sequence_for,
};
use desktop_pet_core::geometry::{
    DragSession, PointI, RectI, SizeI, anchored_resize_handle_rect, bubble_position,
    bubble_size_for_content, centered_resize_position, drag_position, physical_px,
    rescale_drag_session, scaled_size, snap_mascot_width,
};
use desktop_pet_core::state::{
    PetEvent, PetState, directional_drag_event, has_crossed_drag_threshold, transition_pet_state,
};

#[test]
fn preserves_the_slim_state_machine_contract() {
    assert_eq!(directional_drag_event(3, 4), None);
    assert_eq!(directional_drag_event(-3, 4), None);
    assert_eq!(directional_drag_event(4, 4), Some(PetEvent::DragRight));
    assert_eq!(directional_drag_event(-4, 4), Some(PetEvent::DragLeft));
    assert!(!has_crossed_drag_threshold(3, 3, 4));
    assert!(has_crossed_drag_threshold(4, 0, 4));
    assert!(has_crossed_drag_threshold(0, -4, 4));

    let transitions = [
        (PetState::Idle, PetEvent::Press, PetState::Idle),
        (PetState::Waving, PetEvent::Press, PetState::Waving),
        (PetState::Jumping, PetEvent::Press, PetState::Jumping),
        (PetState::Idle, PetEvent::DragRight, PetState::RunningRight),
        (PetState::Waving, PetEvent::DragLeft, PetState::RunningLeft),
        (
            PetState::RunningRight,
            PetEvent::DragLeft,
            PetState::RunningLeft,
        ),
        (
            PetState::RunningLeft,
            PetEvent::DragRight,
            PetState::RunningRight,
        ),
        (PetState::RunningRight, PetEvent::DragEnd, PetState::Idle),
        (PetState::RunningLeft, PetEvent::DragEnd, PetState::Idle),
        (PetState::Idle, PetEvent::Click, PetState::Waving),
        (PetState::Waving, PetEvent::ActionComplete, PetState::Idle),
        (PetState::Idle, PetEvent::HoverEnter, PetState::Jumping),
        (PetState::Waving, PetEvent::HoverEnter, PetState::Jumping),
        (PetState::Jumping, PetEvent::HoverLeave, PetState::Idle),
        (
            PetState::RunningRight,
            PetEvent::Click,
            PetState::RunningRight,
        ),
        (
            PetState::RunningLeft,
            PetEvent::HoverEnter,
            PetState::RunningLeft,
        ),
        (PetState::Idle, PetEvent::ActionComplete, PetState::Idle),
    ];

    for (state, event, expected) in transitions {
        assert_eq!(transition_pet_state(state, event), expected);
    }
}

#[test]
fn preserves_the_existing_eight_by_nine_animation_timeline() {
    assert_eq!((ATLAS_COLUMNS, ATLAS_ROWS), (8, 9));
    assert_eq!((CELL_WIDTH, CELL_HEIGHT), (192, 208));

    let idle = sequence_for(PetState::Idle, false);
    assert_eq!(idle.frames.len(), 6);
    assert_eq!(idle.frames[0].duration_ms, 1_680);
    assert_eq!(idle.frames[5].duration_ms, 1_920);
    assert_eq!(idle.loop_start_index, Some(0));

    let running = sequence_for(PetState::RunningRight, false);
    assert_eq!(running.frames.len(), 8);
    assert!(running.frames.iter().all(|frame| frame.row == 1));
    assert_eq!(running.loop_start_index, Some(0));

    let jumping = sequence_for(PetState::Jumping, false);
    assert_eq!(jumping.frames.len(), 5 * 3 + 6);
    assert_eq!(jumping.loop_start_index, Some(5 * 3));
    assert_eq!(action_duration_ms(PetState::Waving), Some(2_100));
    assert_eq!(action_duration_ms(PetState::Jumping), Some(2_520));

    let reduced = sequence_for(PetState::RunningLeft, true);
    assert_eq!(reduced.frames.len(), 1);
    assert_eq!(reduced.loop_start_index, None);
}

#[test]
fn keeps_dragging_stable_across_negative_coordinates_and_mixed_dpi() {
    assert_eq!(physical_px(120, 96), 120);
    assert_eq!(physical_px(120, 144), 180);
    assert_eq!(physical_px(120, 192), 240);
    assert_eq!(
        scaled_size(
            120,
            SizeI {
                width: 192,
                height: 208,
            },
            144,
        ),
        SizeI {
            width: 180,
            height: 195,
        },
    );

    let session = DragSession {
        pointer_offset: PointI { x: 60, y: 80 },
    };
    assert_eq!(
        drag_position(
            PointI { x: -2_500, y: -100 },
            session,
            SizeI {
                width: 120,
                height: 130,
            },
            RectI {
                left: -1_920,
                top: 0,
                right: 0,
                bottom: 1_040,
            },
        ),
        PointI { x: -1_920, y: 0 },
    );

    let scaled_session = rescale_drag_session(
        DragSession {
            pointer_offset: PointI { x: 90, y: 104 },
        },
        SizeI {
            width: 120,
            height: 130,
        },
        SizeI {
            width: 240,
            height: 260,
        },
    );
    assert_eq!(scaled_session.pointer_offset, PointI { x: 180, y: 208 });
}

#[test]
fn snaps_direct_resize_to_the_existing_twelve_pixel_range() {
    assert_eq!(snap_mascot_width(80.0), 84);
    assert_eq!(snap_mascot_width(89.0), 84);
    assert_eq!(snap_mascot_width(91.0), 96);
    assert_eq!(snap_mascot_width(181.0), 180);
    assert_eq!(snap_mascot_width(500.0), 228);
    assert_eq!(snap_mascot_width(f64::NAN), 120);

    assert_eq!(
        centered_resize_position(
            RectI {
                left: 100,
                top: 100,
                right: 220,
                bottom: 230,
            },
            SizeI {
                width: 180,
                height: 195,
            },
            RectI {
                left: 0,
                top: 0,
                right: 1_920,
                bottom: 1_040,
            },
        ),
        PointI { x: 70, y: 68 },
    );
}

#[test]
fn anchors_the_resize_handle_to_visible_pixels_instead_of_transparent_frame_padding() {
    let handle = anchored_resize_handle_rect(
        RectI {
            left: 26,
            top: 18,
            right: 92,
            bottom: 104,
        },
        SizeI {
            width: 120,
            height: 130,
        },
        28,
    );
    assert_eq!(
        handle,
        RectI {
            left: 78,
            top: 90,
            right: 106,
            bottom: 118,
        }
    );
    assert!(handle.contains(PointI { x: 90, y: 104 }));
    assert!(!handle.contains(PointI { x: 77, y: 104 }));

    assert_eq!(
        anchored_resize_handle_rect(
            RectI {
                left: 0,
                top: 0,
                right: 8,
                bottom: 8,
            },
            SizeI {
                width: 16,
                height: 12,
            },
            40,
        ),
        RectI {
            left: 2,
            top: 0,
            right: 14,
            bottom: 12,
        }
    );
}

#[test]
fn anchors_bubbles_above_the_pet_and_flips_below_at_the_work_area_edge() {
    let work_area = RectI {
        left: -1_920,
        top: 0,
        right: 0,
        bottom: 1_040,
    };
    let bubble = SizeI {
        width: 300,
        height: 100,
    };
    assert_eq!(
        bubble_position(
            RectI {
                left: -1_500,
                top: 400,
                right: -1_380,
                bottom: 530,
            },
            bubble,
            work_area,
            12,
        ),
        PointI { x: -1_590, y: 288 },
    );
    assert_eq!(
        bubble_position(
            RectI {
                left: -1_910,
                top: 10,
                right: -1_790,
                bottom: 140,
            },
            bubble,
            work_area,
            12,
        ),
        PointI { x: -1_920, y: 152 },
    );
}

#[test]
fn keeps_bubbles_compact_while_clamping_long_copy() {
    let minimum = SizeI {
        width: 120,
        height: 44,
    };
    let maximum = SizeI {
        width: 240,
        height: 92,
    };
    let padding = SizeI {
        width: 14,
        height: 9,
    };

    assert_eq!(
        bubble_size_for_content(
            SizeI {
                width: 62,
                height: 18,
            },
            minimum,
            maximum,
            padding,
        ),
        minimum,
    );
    assert_eq!(
        bubble_size_for_content(
            SizeI {
                width: 168,
                height: 36,
            },
            minimum,
            maximum,
            padding,
        ),
        SizeI {
            width: 196,
            height: 54,
        },
    );
    assert_eq!(
        bubble_size_for_content(
            SizeI {
                width: 400,
                height: 120,
            },
            minimum,
            maximum,
            padding,
        ),
        maximum,
    );
}
