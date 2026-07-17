use desktop_pet_core::manifest::{
    AssetPathError, BubbleScene, normalize_asset_path, normalize_pet_manifest,
};
use desktop_pet_core::preferences::{
    PetPreferences, migrate_selected_pet_id, parse_preferences, serialize_preferences,
};
use serde_json::json;

#[test]
fn normalizes_manifest_v1_without_changing_the_player_contract() {
    let result = normalize_pet_manifest(&json!({
        "id": " pet-01 ",
        "displayName": " 七秀 ",
        "description": " 角色说明 ",
        "spritesheetPath": "assets\\spritesheet.webp",
        "author": " Pi Team ",
        "version": " 1.0.0 ",
        "tags": [" jx3 ", " built-in "],
        "faction": " 七秀 ",
        "recommendedScale": "1.156",
        "accentColor": " #A0F ",
        "behaviorProfile": " watchful ",
        "bubbleLines": {
            "welcome": [" 我来啦。 "],
            "click": [" 我在。 "],
            "drag": [" 慢点搬。 "],
            "petSwitch": [" 换我接班。 "]
        },
        "legacyField": true
    }));

    assert!(result.missing_fields.is_empty());
    assert!(result.invalid_optional_fields.is_empty());
    let manifest = result.manifest.expect("valid manifest");
    assert_eq!(manifest.id, "pet-01");
    assert_eq!(manifest.display_name, "七秀");
    assert_eq!(manifest.description.as_deref(), Some("角色说明"));
    assert_eq!(manifest.author.as_deref(), Some("Pi Team"));
    assert_eq!(manifest.tags, Some(vec!["jx3".into(), "built-in".into()]));
    assert_eq!(manifest.recommended_scale, Some(1.16));
    assert_eq!(manifest.accent_color.as_deref(), Some("#a0f"));
    assert_eq!(
        manifest
            .bubble_lines
            .as_ref()
            .and_then(|lines| lines.for_scene(BubbleScene::Welcome)),
        Some(["我来啦。".to_string()].as_slice()),
    );
}

#[test]
fn rejects_missing_required_fields_and_ignores_invalid_optional_fields() {
    let missing = normalize_pet_manifest(&json!({
        "id": " ",
        "displayName": 7,
        "spritesheetPath": "spritesheet.webp"
    }));
    assert_eq!(missing.missing_fields, vec!["id", "displayName"]);
    assert!(missing.manifest.is_none());

    let optional = normalize_pet_manifest(&json!({
        "id": "pet-01",
        "displayName": "Pet",
        "spritesheetPath": "spritesheet.webp",
        "author": 7,
        "version": "",
        "tags": "jx3",
        "faction": [],
        "recommendedScale": 8,
        "accentColor": "green",
        "behaviorProfile": {},
        "bubbleLines": { "click": [] }
    }));
    assert_eq!(
        optional.invalid_optional_fields,
        vec![
            "author",
            "version",
            "tags",
            "faction",
            "recommendedScale",
            "accentColor",
            "behaviorProfile",
            "bubbleLines",
        ],
    );
    let manifest = optional.manifest.expect("required fields remain valid");
    assert!(manifest.author.is_none());
    assert!(manifest.bubble_lines.is_none());
}

#[test]
fn constrains_spritesheets_to_a_safe_pet_relative_path() {
    assert_eq!(
        normalize_asset_path("assets\\spritesheet.webp"),
        Ok("assets/spritesheet.webp".to_string()),
    );
    assert_eq!(
        normalize_asset_path("../outside.webp"),
        Err(AssetPathError::Traversal)
    );
    assert_eq!(
        normalize_asset_path("C:\\tmp\\sprite.webp"),
        Err(AssetPathError::Absolute)
    );
    assert_eq!(
        normalize_asset_path("/tmp/sprite.webp"),
        Err(AssetPathError::Absolute)
    );
    assert_eq!(
        normalize_asset_path("assets//sprite.webp"),
        Err(AssetPathError::Unsafe)
    );
    assert_eq!(
        normalize_asset_path("./sprite.webp"),
        Err(AssetPathError::Unsafe)
    );
}

#[test]
fn reads_legacy_settings_but_only_writes_the_three_slim_fields() {
    let preferences = parse_preferences(
        r#"{
          "selectedPetId": " project:player-03 ",
          "mascotWidthPx": 180,
          "opacity": 0.5,
          "alwaysOnTopEnabled": false,
          "launchAtLogin": true
        }"#,
    );
    assert_eq!(
        preferences,
        PetPreferences {
            selected_pet_id: Some("project:player-03".into()),
            mascot_width_px: Some(180),
            launch_at_login: true,
        },
    );

    let serialized = serialize_preferences(&preferences).expect("settings should serialize");
    assert!(serialized.ends_with('\n'));
    assert!(serialized.contains("\"selectedPetId\": \"project:player-03\""));
    assert!(serialized.contains("\"mascotWidthPx\": 180"));
    assert!(serialized.contains("\"launchAtLogin\": true"));
    assert!(!serialized.contains("opacity"));
    assert!(!serialized.contains("alwaysOnTopEnabled"));

    assert_eq!(parse_preferences("{broken-json"), PetPreferences::default());
    assert_eq!(
        migrate_selected_pet_id(Some("project:player-03".into())),
        Some("user:player-03".into()),
    );
    assert_eq!(
        migrate_selected_pet_id(Some("user:player-03".into())),
        Some("user:player-03".into()),
    );
}

#[test]
fn matches_the_existing_selection_and_width_normalization() {
    let preferences = parse_preferences(
        r#"{
          "selectedPetId": "",
          "mascotWidthPx": "203.6",
          "launchAtLogin": "true"
        }"#,
    );
    assert_eq!(preferences.selected_pet_id, None);
    assert_eq!(preferences.mascot_width_px, Some(204));
    assert!(!preferences.launch_at_login);

    let too_long = "x".repeat(201);
    let preferences = parse_preferences(&format!(r#"{{"selectedPetId":"{too_long}"}}"#));
    assert_eq!(preferences.selected_pet_id, None);

    let unicode_id = "宠".repeat(200);
    let preferences = parse_preferences(&format!(r#"{{"selectedPetId":"{unicode_id}"}}"#));
    assert_eq!(
        preferences.selected_pet_id.as_deref(),
        Some(unicode_id.as_str())
    );
}
