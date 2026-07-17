use serde::Serialize;
use serde_json::Value;

pub const PREFERENCES_FILE_NAME: &str = "desktop-pet-settings.json";

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetPreferences {
    pub selected_pet_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mascot_width_px: Option<i32>,
    pub launch_at_login: bool,
}

pub fn parse_preferences(input: &str) -> PetPreferences {
    let Ok(value) = serde_json::from_str::<Value>(input) else {
        return PetPreferences::default();
    };
    let Some(object) = value.as_object() else {
        return PetPreferences::default();
    };

    PetPreferences {
        selected_pet_id: object
            .get("selectedPetId")
            .and_then(normalize_selected_pet_id),
        mascot_width_px: object.get("mascotWidthPx").and_then(normalize_mascot_width),
        launch_at_login: object.get("launchAtLogin").and_then(Value::as_bool) == Some(true),
    }
}

pub fn serialize_preferences(preferences: &PetPreferences) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(preferences).map(|serialized| format!("{serialized}\n"))
}

pub fn normalize_selected_pet_id(value: &Value) -> Option<String> {
    let trimmed = value.as_str()?.trim();
    (!trimmed.is_empty() && trimmed.encode_utf16().count() <= 200).then(|| trimmed.to_string())
}

pub fn normalize_mascot_width(value: &Value) -> Option<i32> {
    let number = json_number(value)?;
    (number.is_finite() && (84.0..=228.0).contains(&number)).then(|| number.round() as i32)
}

pub fn migrate_selected_pet_id(selected_pet_id: Option<String>) -> Option<String> {
    selected_pet_id.map(|value| {
        value
            .strip_prefix("project:")
            .map_or(value.clone(), |id| format!("user:{id}"))
    })
}

fn json_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(string) => string.trim().parse().ok(),
        Value::Bool(boolean) => Some(u8::from(*boolean).into()),
        _ => None,
    }
}
