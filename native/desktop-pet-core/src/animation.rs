use crate::state::PetState;

pub const ATLAS_COLUMNS: u32 = 8;
pub const ATLAS_ROWS: u32 = 9;
pub const CELL_WIDTH: u32 = 192;
pub const CELL_HEIGHT: u32 = 208;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Frame {
    pub row: u32,
    pub column: u32,
    pub duration_ms: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AnimationSequence {
    pub frames: Vec<Frame>,
    pub loop_start_index: Option<usize>,
}

const IDLE: [Frame; 6] = [
    Frame {
        row: 0,
        column: 0,
        duration_ms: 280,
    },
    Frame {
        row: 0,
        column: 1,
        duration_ms: 110,
    },
    Frame {
        row: 0,
        column: 2,
        duration_ms: 110,
    },
    Frame {
        row: 0,
        column: 3,
        duration_ms: 140,
    },
    Frame {
        row: 0,
        column: 4,
        duration_ms: 140,
    },
    Frame {
        row: 0,
        column: 5,
        duration_ms: 320,
    },
];

pub fn state_frames(state: PetState) -> Vec<Frame> {
    match state {
        PetState::Idle => IDLE.to_vec(),
        PetState::RunningRight => row_frames(1, 8, 120, 220),
        PetState::RunningLeft => row_frames(2, 8, 120, 220),
        PetState::Waving => row_frames(3, 4, 140, 280),
        PetState::Jumping => row_frames(4, 5, 140, 280),
    }
}

pub fn action_duration_ms(state: PetState) -> Option<u32> {
    if !matches!(state, PetState::Waving | PetState::Jumping) {
        return None;
    }
    Some(
        state_frames(state)
            .iter()
            .map(|frame| frame.duration_ms)
            .sum::<u32>()
            * 3,
    )
}

pub fn sequence_for(state: PetState, reduced_motion: bool) -> AnimationSequence {
    let current = state_frames(state);
    if reduced_motion {
        return AnimationSequence {
            frames: vec![current[0]],
            loop_start_index: None,
        };
    }

    match state {
        PetState::Idle => AnimationSequence {
            frames: current
                .into_iter()
                .map(|frame| Frame {
                    duration_ms: frame.duration_ms * 6,
                    ..frame
                })
                .collect(),
            loop_start_index: Some(0),
        },
        PetState::RunningRight | PetState::RunningLeft => AnimationSequence {
            frames: current,
            loop_start_index: Some(0),
        },
        PetState::Waving | PetState::Jumping => {
            let action_len = current.len() * 3;
            let mut frames = Vec::with_capacity(action_len + IDLE.len());
            for _ in 0..3 {
                frames.extend_from_slice(&current);
            }
            frames.extend_from_slice(&IDLE);
            AnimationSequence {
                frames,
                loop_start_index: Some(action_len),
            }
        }
    }
}

fn row_frames(row: u32, count: u32, duration_ms: u32, final_ms: u32) -> Vec<Frame> {
    (0..count)
        .map(|column| Frame {
            row,
            column,
            duration_ms: if column + 1 == count {
                final_ms
            } else {
                duration_ms
            },
        })
        .collect()
}
