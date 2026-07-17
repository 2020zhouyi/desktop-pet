use crate::manifest::{BubbleScene, PetManifest};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BubbleCadence {
    Quiet,
    Normal,
    Lively,
}

pub fn bubble_lines_for_scene(
    manifest: Option<&PetManifest>,
    scene: BubbleScene,
    cadence: BubbleCadence,
) -> Vec<String> {
    let manifest_lines = manifest
        .and_then(|manifest| manifest.bubble_lines.as_ref())
        .and_then(|lines| lines.for_scene(scene));
    let base_lines = manifest_lines
        .map(<[String]>::to_vec)
        .unwrap_or_else(|| fallback_line(scene).into_iter().map(String::from).collect());

    match cadence {
        BubbleCadence::Quiet => vec![quiet_line(scene).to_string()],
        BubbleCadence::Normal => base_lines,
        BubbleCadence::Lively => base_lines
            .into_iter()
            .chain([lively_line(scene).to_string()])
            .collect(),
    }
}

pub fn select_bubble_line(
    lines: &[String],
    seed: &str,
    recent_texts: &[String],
    fallback_text: &str,
) -> String {
    let pool = if lines.is_empty() && !fallback_text.is_empty() {
        vec![fallback_text.to_string()]
    } else {
        lines.to_vec()
    };
    if pool.is_empty() {
        return String::new();
    }

    let start_index = hash_string(seed) % pool.len();
    for offset in 0..pool.len() {
        let line = &pool[(start_index + offset) % pool.len()];
        if !recent_texts.contains(line) {
            return line.clone();
        }
    }
    pool[start_index].clone()
}

pub fn add_recent_bubble_text(recent_texts: &[String], text: &str, limit: usize) -> Vec<String> {
    if limit == 0 || text.is_empty() {
        return Vec::new();
    }
    std::iter::once(text.to_string())
        .chain(
            recent_texts
                .iter()
                .filter(|recent| recent.as_str() != text)
                .cloned(),
        )
        .take(limit)
        .collect()
}

pub fn bubble_cooldown_multiplier(cadence: BubbleCadence) -> f64 {
    match cadence {
        BubbleCadence::Quiet => 1.6,
        BubbleCadence::Normal => 1.0,
        BubbleCadence::Lively => 0.75,
    }
}

fn fallback_line(scene: BubbleScene) -> [&'static str; 1] {
    match scene {
        BubbleScene::Welcome => ["我上线啦，今天也陪你一会儿。"],
        BubbleScene::Click => ["我在呢。"],
        BubbleScene::Drag => ["慢点慢点，我跟上。"],
        BubbleScene::PetSwitch => ["换好啦，我来接班。"],
    }
}

fn quiet_line(scene: BubbleScene) -> &'static str {
    match scene {
        BubbleScene::Welcome => "我来啦。",
        BubbleScene::Click => "在。",
        BubbleScene::Drag => "慢慢来。",
        BubbleScene::PetSwitch => "换好了。",
    }
}

fn lively_line(scene: BubbleScene) -> &'static str {
    match scene {
        BubbleScene::Welcome => "我来啦，桌面今日营业！",
        BubbleScene::Click => "收到！",
        BubbleScene::Drag => "换个地方继续陪你。",
        BubbleScene::PetSwitch => "交接完成，下一位上场。",
    }
}

fn hash_string(seed: &str) -> usize {
    seed.chars()
        .map(|character| character.encode_utf16(&mut [0; 2])[0] as usize)
        .sum()
}
