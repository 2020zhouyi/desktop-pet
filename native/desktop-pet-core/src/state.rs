#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PetState {
    Idle,
    RunningRight,
    RunningLeft,
    Waving,
    Jumping,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PetEvent {
    Press,
    DragLeft,
    DragRight,
    DragEnd,
    Click,
    Jump,
    HoverEnter,
    HoverLeave,
    ActionComplete,
}

pub const INITIAL_PET_STATE: PetState = PetState::Idle;

pub fn directional_drag_event(delta_x: i32, threshold_px: i32) -> Option<PetEvent> {
    let threshold_px = threshold_px.max(0);
    if delta_x >= threshold_px {
        return Some(PetEvent::DragRight);
    }
    if delta_x <= -threshold_px {
        return Some(PetEvent::DragLeft);
    }
    None
}

pub fn has_crossed_drag_threshold(delta_x: i32, delta_y: i32, threshold_px: i32) -> bool {
    let threshold_px = i64::from(threshold_px.max(0));
    i64::from(delta_x).abs() >= threshold_px || i64::from(delta_y).abs() >= threshold_px
}

pub fn transition_pet_state(state: PetState, event: PetEvent) -> PetState {
    match event {
        PetEvent::DragLeft => return PetState::RunningLeft,
        PetEvent::DragRight => return PetState::RunningRight,
        _ => {}
    }

    if matches!(state, PetState::RunningLeft | PetState::RunningRight) {
        return if event == PetEvent::DragEnd {
            PetState::Idle
        } else {
            state
        };
    }

    if event == PetEvent::ActionComplete {
        return PetState::Idle;
    }
    if state == PetState::Idle && event == PetEvent::Click {
        return PetState::Waving;
    }
    if event == PetEvent::HoverEnter {
        return PetState::Jumping;
    }
    if state == PetState::Jumping && event == PetEvent::HoverLeave {
        return PetState::Idle;
    }
    if state == PetState::Idle && event == PetEvent::Jump {
        return PetState::Jumping;
    }
    state
}
