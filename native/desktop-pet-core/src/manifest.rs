use serde::Serialize;
use serde_json::{Map, Value};

pub const REQUIRED_MANIFEST_FIELDS: [&str; 3] = ["id", "displayName", "spritesheetPath"];
pub const OPTIONAL_MANIFEST_FIELDS: [&str; 8] = [
    "author",
    "version",
    "tags",
    "faction",
    "recommendedScale",
    "accentColor",
    "behaviorProfile",
    "bubbleLines",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BubbleScene {
    Welcome,
    Click,
    Drag,
    PetSwitch,
}

impl BubbleScene {
    pub const ALL: [Self; 4] = [Self::Welcome, Self::Click, Self::Drag, Self::PetSwitch];
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BubbleLines {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub welcome: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub click: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drag: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pet_switch: Option<Vec<String>>,
}

impl BubbleLines {
    pub fn for_scene(&self, scene: BubbleScene) -> Option<&[String]> {
        match scene {
            BubbleScene::Welcome => self.welcome.as_deref(),
            BubbleScene::Click => self.click.as_deref(),
            BubbleScene::Drag => self.drag.as_deref(),
            BubbleScene::PetSwitch => self.pet_switch.as_deref(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetManifest {
    pub id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub spritesheet_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub faction: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommended_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behavior_profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bubble_lines: Option<BubbleLines>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ManifestNormalization {
    pub manifest: Option<PetManifest>,
    pub missing_fields: Vec<&'static str>,
    pub invalid_optional_fields: Vec<&'static str>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetPathError {
    Absolute,
    Traversal,
    Unsafe,
}

pub fn normalize_pet_manifest(value: &Value) -> ManifestNormalization {
    let object = value.as_object();
    let id = required_string(object, "id");
    let display_name = required_string(object, "displayName");
    let spritesheet_path = required_string(object, "spritesheetPath");

    let mut missing_fields = Vec::new();
    if id.is_none() {
        missing_fields.push("id");
    }
    if display_name.is_none() {
        missing_fields.push("displayName");
    }
    if spritesheet_path.is_none() {
        missing_fields.push("spritesheetPath");
    }
    if !missing_fields.is_empty() {
        return ManifestNormalization {
            manifest: None,
            missing_fields,
            invalid_optional_fields: Vec::new(),
        };
    }

    let object = object.expect("required fields imply a JSON object");
    let mut invalid_optional_fields = Vec::new();
    let author = optional_field(
        object,
        "author",
        trimmed_string,
        &mut invalid_optional_fields,
    );
    let version = optional_field(
        object,
        "version",
        trimmed_string,
        &mut invalid_optional_fields,
    );
    let tags = optional_field(object, "tags", normalize_tags, &mut invalid_optional_fields);
    let faction = optional_field(
        object,
        "faction",
        trimmed_string,
        &mut invalid_optional_fields,
    );
    let recommended_scale = optional_field(
        object,
        "recommendedScale",
        normalize_recommended_scale,
        &mut invalid_optional_fields,
    );
    let accent_color = optional_field(
        object,
        "accentColor",
        normalize_accent_color,
        &mut invalid_optional_fields,
    );
    let behavior_profile = optional_field(
        object,
        "behaviorProfile",
        trimmed_string,
        &mut invalid_optional_fields,
    );
    let bubble_lines = optional_field(
        object,
        "bubbleLines",
        normalize_bubble_lines,
        &mut invalid_optional_fields,
    );

    ManifestNormalization {
        manifest: Some(PetManifest {
            id: id.expect("validated id"),
            display_name: display_name.expect("validated displayName"),
            description: object.get("description").and_then(trimmed_string),
            spritesheet_path: spritesheet_path.expect("validated spritesheetPath"),
            author,
            version,
            tags,
            faction,
            recommended_scale,
            accent_color,
            behavior_profile,
            bubble_lines,
        }),
        missing_fields,
        invalid_optional_fields,
    }
}

pub fn normalize_asset_path(value: &str) -> Result<String, AssetPathError> {
    if value.contains('\0') {
        return Err(AssetPathError::Unsafe);
    }
    let bytes = value.as_bytes();
    if value.starts_with(['/', '\\'])
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':')
    {
        return Err(AssetPathError::Absolute);
    }

    let parts = value.split(['/', '\\']).collect::<Vec<_>>();
    if parts.iter().any(|part| part.is_empty() || *part == ".") {
        return Err(AssetPathError::Unsafe);
    }
    if parts.contains(&"..") {
        return Err(AssetPathError::Traversal);
    }
    Ok(parts.join("/"))
}

fn required_string(object: Option<&Map<String, Value>>, field: &str) -> Option<String> {
    object?.get(field).and_then(trimmed_string)
}

fn optional_field<T>(
    object: &Map<String, Value>,
    field: &'static str,
    normalize: impl FnOnce(&Value) -> Option<T>,
    invalid_fields: &mut Vec<&'static str>,
) -> Option<T> {
    let value = object.get(field)?;
    let normalized = normalize(value);
    if normalized.is_none() {
        invalid_fields.push(field);
    }
    normalized
}

fn trimmed_string(value: &Value) -> Option<String> {
    let trimmed = value.as_str()?.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn normalize_tags(value: &Value) -> Option<Vec<String>> {
    value
        .as_array()?
        .iter()
        .map(trimmed_string)
        .collect::<Option<Vec<_>>>()
}

fn normalize_recommended_scale(value: &Value) -> Option<f64> {
    let number = json_number(value)?;
    if !number.is_finite() || !(0.5..=2.0).contains(&number) {
        return None;
    }
    Some((number * 100.0).round() / 100.0)
}

fn normalize_accent_color(value: &Value) -> Option<String> {
    let trimmed = value.as_str()?.trim();
    let valid_length = trimmed.len() == 4 || trimmed.len() == 7;
    let valid_digits = trimmed
        .strip_prefix('#')
        .is_some_and(|digits| digits.bytes().all(|byte| byte.is_ascii_hexdigit()));
    (valid_length && valid_digits).then(|| trimmed.to_ascii_lowercase())
}

fn normalize_bubble_lines(value: &Value) -> Option<BubbleLines> {
    let object = value.as_object()?;
    Some(BubbleLines {
        welcome: optional_lines(object, "welcome")?,
        click: optional_lines(object, "click")?,
        drag: optional_lines(object, "drag")?,
        pet_switch: optional_lines(object, "petSwitch")?,
    })
}

fn optional_lines(object: &Map<String, Value>, field: &str) -> Option<Option<Vec<String>>> {
    let Some(value) = object.get(field) else {
        return Some(None);
    };
    let values = value.as_array()?;
    if values.is_empty() {
        return None;
    }
    values
        .iter()
        .map(trimmed_string)
        .collect::<Option<Vec<_>>>()
        .map(Some)
}

fn json_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(string) => string.trim().parse().ok(),
        Value::Bool(boolean) => Some(u8::from(*boolean).into()),
        _ => None,
    }
}
