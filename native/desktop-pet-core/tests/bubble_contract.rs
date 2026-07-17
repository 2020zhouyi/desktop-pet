use desktop_pet_core::bubbles::{
    BubbleCadence, add_recent_bubble_text, bubble_cooldown_multiplier, bubble_lines_for_scene,
    select_bubble_line,
};
use desktop_pet_core::manifest::{BubbleScene, normalize_pet_manifest};
use serde_json::json;

#[test]
fn keeps_only_the_four_direct_interaction_scenes() {
    assert_eq!(
        BubbleScene::ALL,
        [
            BubbleScene::Welcome,
            BubbleScene::Click,
            BubbleScene::Drag,
            BubbleScene::PetSwitch,
        ],
    );
}

#[test]
fn manifest_lines_override_the_generic_fallback_in_normal_cadence() {
    let manifest = normalize_pet_manifest(&json!({
        "id": "editable-pet",
        "displayName": "可编辑角色",
        "spritesheetPath": "spritesheet.webp",
        "bubbleLines": {
            "welcome": ["角色 JSON 欢迎词"],
            "click": ["角色 JSON 点击词"],
            "drag": ["角色 JSON 拖拽词"],
            "petSwitch": ["角色 JSON 切换词"]
        }
    }))
    .manifest
    .expect("fixture manifest");

    assert_eq!(
        bubble_lines_for_scene(Some(&manifest), BubbleScene::Welcome, BubbleCadence::Normal),
        vec!["角色 JSON 欢迎词".to_string()],
    );
    assert_eq!(
        bubble_lines_for_scene(Some(&manifest), BubbleScene::Click, BubbleCadence::Quiet),
        vec!["在。".to_string()],
    );
    assert_eq!(
        bubble_lines_for_scene(Some(&manifest), BubbleScene::Drag, BubbleCadence::Lively),
        vec![
            "角色 JSON 拖拽词".to_string(),
            "换个地方继续陪你。".to_string(),
        ],
    );
}

#[test]
fn bubble_selection_avoids_recent_text_and_matches_the_existing_cadence_values() {
    let lines = vec!["甲".to_string(), "乙".to_string(), "丙".to_string()];
    let first = select_bubble_line(&lines, "pet:click:normal", &[], "");
    let next = select_bubble_line(&lines, "pet:click:normal", std::slice::from_ref(&first), "");
    assert_ne!(first, next);

    assert_eq!(
        add_recent_bubble_text(&["旧".into(), "重复".into()], "重复", 4),
        vec!["重复".to_string(), "旧".to_string()],
    );
    assert_eq!(bubble_cooldown_multiplier(BubbleCadence::Quiet), 1.6);
    assert_eq!(bubble_cooldown_multiplier(BubbleCadence::Normal), 1.0);
    assert_eq!(bubble_cooldown_multiplier(BubbleCadence::Lively), 0.75);
}

#[test]
fn empty_custom_manifests_still_have_non_empty_fallback_lines() {
    for scene in BubbleScene::ALL {
        assert!(
            !bubble_lines_for_scene(None, scene, BubbleCadence::Normal).is_empty(),
            "{scene:?} should have a fallback",
        );
    }
}
