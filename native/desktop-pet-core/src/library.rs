use crate::manifest::{PetManifest, normalize_asset_path, normalize_pet_manifest};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const PREFERRED_DEFAULT_PET_ID: &str = "jx3-u4e03-u79c0-01";
pub const BUNDLED_PET_SEED_MARKER: &str = ".bundled-pets-seeded-v1.json";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LibraryIssueSeverity {
    Warning,
    Error,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LibraryIssueKind {
    MissingManifest,
    InvalidJson,
    InvalidManifest,
    InvalidOptionalField,
    UnsafeAssetPath,
    MissingAsset,
    UnexpectedEntry,
    Symlink,
    DuplicateId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LibraryIssue {
    pub folder_name: String,
    pub severity: LibraryIssueSeverity,
    pub kind: LibraryIssueKind,
    pub detail: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PetRecord {
    pub runtime_id: String,
    pub folder: PathBuf,
    pub spritesheet: PathBuf,
    pub manifest: PetManifest,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct LibraryScan {
    pub pets: Vec<PetRecord>,
    pub issues: Vec<LibraryIssue>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SeedResult {
    pub seeded: bool,
    pub copied_folders: Vec<String>,
    pub preserved_folders: Vec<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ConsumeResult {
    pub consumed: bool,
    pub moved_folders: Vec<String>,
    pub preserved_folders: Vec<String>,
}

pub fn seed_bundled_pet_library(
    bundled_root: &Path,
    library_root: &Path,
) -> io::Result<SeedResult> {
    fs::create_dir_all(library_root)?;
    let marker_path = library_root.join(BUNDLED_PET_SEED_MARKER);
    if marker_path.exists() {
        return Ok(SeedResult::default());
    }

    let mut entries = fs::read_dir(bundled_root)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(fs::DirEntry::file_name);
    let mut source_folders = Vec::new();
    let mut copied_folders = Vec::new();
    let mut preserved_folders = Vec::new();
    for entry in entries {
        let source_folder = entry.file_name().to_string_lossy().into_owned();
        if source_folder.starts_with('.') || !entry.file_type()?.is_dir() {
            continue;
        }
        source_folders.push(source_folder.clone());
        let display_name = read_seed_display_name(&entry.path());
        let destination_folder =
            pet_folder_name(display_name.as_deref().unwrap_or(""), &source_folder);
        let destination = library_root.join(&destination_folder);
        if destination.exists() {
            preserved_folders.push(destination_folder);
            continue;
        }
        copy_directory_staged(&entry.path(), &destination, library_root, &source_folder)?;
        copied_folders.push(destination_folder);
    }

    let marker = serde_json::to_string_pretty(&serde_json::json!({
        "folders": source_folders,
    }))
    .map_err(io::Error::other)?;
    fs::write(marker_path, format!("{marker}\n"))?;
    Ok(SeedResult {
        seeded: true,
        copied_folders,
        preserved_folders,
    })
}

pub fn consume_bundled_pet_library(
    bundled_root: &Path,
    library_root: &Path,
) -> io::Result<ConsumeResult> {
    fs::create_dir_all(library_root)?;
    let marker_path = library_root.join(BUNDLED_PET_SEED_MARKER);
    if marker_path.exists() {
        remove_directory_best_effort(bundled_root);
        return Ok(ConsumeResult::default());
    }

    let mut entries = fs::read_dir(bundled_root)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(fs::DirEntry::file_name);
    let mut source_folders = Vec::new();
    let mut moved_folders = Vec::new();
    let mut preserved_folders = Vec::new();
    for entry in entries {
        let source_folder = entry.file_name().to_string_lossy().into_owned();
        if source_folder.starts_with('.') || !entry.file_type()?.is_dir() {
            continue;
        }
        source_folders.push(source_folder.clone());
        let source = entry.path();
        let display_name = read_seed_display_name(&source);
        let destination_folder =
            pet_folder_name(display_name.as_deref().unwrap_or(""), &source_folder);
        let destination = library_root.join(&destination_folder);
        if destination.exists() {
            preserved_folders.push(destination_folder);
            remove_directory_best_effort(&source);
            continue;
        }

        move_directory_with_copy_fallback(&source, &destination, library_root, &source_folder)?;
        moved_folders.push(destination_folder);
    }

    let marker = serde_json::to_string_pretty(&serde_json::json!({
        "folders": source_folders,
    }))
    .map_err(io::Error::other)?;
    fs::write(marker_path, format!("{marker}\n"))?;
    remove_directory_best_effort(bundled_root);
    Ok(ConsumeResult {
        consumed: true,
        moved_folders,
        preserved_folders,
    })
}

pub fn pet_folder_name(display_name: &str, fallback: &str) -> String {
    let friendly_name = strip_codex_pet_suffix(display_name.trim());
    let sanitized = friendly_name
        .chars()
        .map(|character| match character {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '－',
            _ => character,
        })
        .collect::<String>();
    let sanitized = sanitized.trim().trim_end_matches(['.', ' ']).trim();
    if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized.to_string()
    }
}

pub fn scan_pet_library(root: &Path) -> io::Result<LibraryScan> {
    let mut entries = fs::read_dir(root)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(fs::DirEntry::file_name);

    let mut candidates = Vec::new();
    let mut issues = Vec::new();
    for entry in entries {
        let folder_name = entry.file_name().to_string_lossy().into_owned();
        if folder_name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            issues.push(error_issue(
                &folder_name,
                LibraryIssueKind::Symlink,
                "pet folder is a symbolic link",
            ));
            continue;
        }
        if !file_type.is_dir() {
            continue;
        }
        if let Some(pet) = scan_pet_folder(&folder_name, &entry.path(), &mut issues) {
            candidates.push(pet);
        }
    }

    let mut id_counts = HashMap::<String, usize>::new();
    for pet in &candidates {
        *id_counts.entry(pet.manifest.id.clone()).or_default() += 1;
    }

    let mut pets = Vec::new();
    for pet in candidates {
        if id_counts.get(&pet.manifest.id).copied().unwrap_or_default() > 1 {
            issues.push(error_issue(
                pet.folder
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default(),
                LibraryIssueKind::DuplicateId,
                &pet.manifest.id,
            ));
        } else {
            pets.push(pet);
        }
    }
    pets.sort_by(|left, right| {
        pet_sort_score(left)
            .cmp(&pet_sort_score(right))
            .then_with(|| left.manifest.display_name.cmp(&right.manifest.display_name))
            .then_with(|| left.runtime_id.cmp(&right.runtime_id))
    });

    Ok(LibraryScan { pets, issues })
}

pub fn default_pet_id(pets: &[PetRecord]) -> Option<&str> {
    pets.iter()
        .find(|pet| pet.manifest.id == PREFERRED_DEFAULT_PET_ID)
        .or_else(|| pets.iter().find(|pet| pet.manifest.id.starts_with("jx3-")))
        .or_else(|| pets.first())
        .map(|pet| pet.runtime_id.as_str())
}

fn pet_sort_score(pet: &PetRecord) -> u8 {
    if pet.manifest.id == PREFERRED_DEFAULT_PET_ID {
        0
    } else if pet.manifest.id.starts_with("jx3-") {
        1
    } else {
        2
    }
}

fn scan_pet_folder(
    folder_name: &str,
    folder: &Path,
    issues: &mut Vec<LibraryIssue>,
) -> Option<PetRecord> {
    let manifest_path = folder.join("pet.json");
    let manifest_metadata = match fs::symlink_metadata(&manifest_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            issues.push(error_issue(
                folder_name,
                LibraryIssueKind::MissingManifest,
                "pet.json is missing",
            ));
            return None;
        }
        Err(error) => {
            issues.push(error_issue(
                folder_name,
                LibraryIssueKind::InvalidManifest,
                &error.to_string(),
            ));
            return None;
        }
    };
    if manifest_metadata.file_type().is_symlink() || !manifest_metadata.is_file() {
        issues.push(error_issue(
            folder_name,
            LibraryIssueKind::Symlink,
            "pet.json must be a plain file",
        ));
        return None;
    }

    let raw = match fs::read_to_string(&manifest_path) {
        Ok(raw) => raw,
        Err(error) => {
            issues.push(error_issue(
                folder_name,
                LibraryIssueKind::InvalidManifest,
                &error.to_string(),
            ));
            return None;
        }
    };
    let value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            issues.push(error_issue(
                folder_name,
                LibraryIssueKind::InvalidJson,
                &error.to_string(),
            ));
            return None;
        }
    };
    let normalized = normalize_pet_manifest(&value);
    if !normalized.missing_fields.is_empty() {
        issues.push(error_issue(
            folder_name,
            LibraryIssueKind::InvalidManifest,
            &normalized.missing_fields.join(","),
        ));
        return None;
    }
    for field in &normalized.invalid_optional_fields {
        issues.push(LibraryIssue {
            folder_name: folder_name.to_string(),
            severity: LibraryIssueSeverity::Warning,
            kind: LibraryIssueKind::InvalidOptionalField,
            detail: (*field).to_string(),
        });
    }
    let manifest = normalized.manifest.expect("required fields were validated");
    let sprite_relative = match normalize_asset_path(&manifest.spritesheet_path) {
        Ok(path) => path,
        Err(error) => {
            issues.push(error_issue(
                folder_name,
                LibraryIssueKind::UnsafeAssetPath,
                &format!("{error:?}"),
            ));
            return None;
        }
    };
    let spritesheet = folder.join(Path::new(&sprite_relative));
    let sprite_metadata = match fs::symlink_metadata(&spritesheet) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            issues.push(error_issue(
                folder_name,
                LibraryIssueKind::MissingAsset,
                &sprite_relative,
            ));
            return None;
        }
        Err(error) => {
            issues.push(error_issue(
                folder_name,
                LibraryIssueKind::MissingAsset,
                &error.to_string(),
            ));
            return None;
        }
    };
    if sprite_metadata.file_type().is_symlink() {
        issues.push(error_issue(
            folder_name,
            LibraryIssueKind::Symlink,
            &sprite_relative,
        ));
        return None;
    }
    if !sprite_metadata.is_file() {
        issues.push(error_issue(
            folder_name,
            LibraryIssueKind::MissingAsset,
            &sprite_relative,
        ));
        return None;
    }

    match first_disallowed_entry(folder, &sprite_relative) {
        Ok(Some((kind, detail))) => {
            issues.push(error_issue(folder_name, kind, &detail));
            return None;
        }
        Ok(None) => {}
        Err(error) => {
            issues.push(error_issue(
                folder_name,
                LibraryIssueKind::UnexpectedEntry,
                &error.to_string(),
            ));
            return None;
        }
    }

    Some(PetRecord {
        runtime_id: format!("user:{}", manifest.id),
        folder: folder.to_path_buf(),
        spritesheet,
        manifest,
    })
}

fn read_seed_display_name(folder: &Path) -> Option<String> {
    let raw = fs::read_to_string(folder.join("pet.json")).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&raw).ok()?;
    value
        .get("displayName")?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn strip_codex_pet_suffix(value: &str) -> &str {
    let digit_start = value
        .char_indices()
        .rev()
        .take_while(|(_, character)| character.is_ascii_digit())
        .map(|(index, _)| index)
        .last();
    let Some(digit_start) = digit_start else {
        return value;
    };
    let before_digits = &value[..digit_start];
    if before_digits.is_empty()
        || !before_digits
            .chars()
            .next_back()
            .is_some_and(char::is_whitespace)
    {
        return value;
    }
    let before_digits = before_digits.trim_end();
    const SUFFIX: &str = "codex pet";
    if before_digits.len() < SUFFIX.len() {
        return value;
    }
    let suffix_start = before_digits.len() - SUFFIX.len();
    let suffix = &before_digits[suffix_start..];
    if !suffix.eq_ignore_ascii_case(SUFFIX) {
        return value;
    }
    let before_suffix = &before_digits[..suffix_start];
    if !before_suffix
        .chars()
        .next_back()
        .is_some_and(char::is_whitespace)
    {
        return value;
    }
    before_suffix.trim_end()
}

fn copy_directory_staged(
    source: &Path,
    destination: &Path,
    library_root: &Path,
    source_folder: &str,
) -> io::Result<()> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let staging = library_root.join(format!(
        ".importing-{source_folder}-{}-{nonce}",
        std::process::id(),
    ));
    let result = copy_directory(source, &staging).and_then(|()| fs::rename(&staging, destination));
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

fn move_directory_with_copy_fallback(
    source: &Path,
    destination: &Path,
    library_root: &Path,
    source_folder: &str,
) -> io::Result<()> {
    validate_plain_directory(source)?;
    if fs::rename(source, destination).is_ok() {
        return Ok(());
    }

    copy_directory_staged(source, destination, library_root, source_folder)?;
    remove_directory_best_effort(source);
    Ok(())
}

fn remove_directory_best_effort(path: &Path) {
    if let Err(error) = fs::remove_dir_all(path)
        && error.kind() != io::ErrorKind::NotFound
    {
        // A packaged resource can be read-only (for example under Program Files).
        // The writable copy is already complete, so cleanup must not block startup.
    }
}

fn validate_plain_directory(source: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{} is not a plain directory", source.display()),
        ));
    }
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{} is a symbolic link", entry.path().display()),
            ));
        }
        if file_type.is_dir() {
            validate_plain_directory(&entry.path())?;
        } else if !file_type.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{} is not a plain file", entry.path().display()),
            ));
        }
    }
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{} is not a plain directory", source.display()),
        ));
    }
    fs::create_dir(destination)?;
    let mut entries = fs::read_dir(source)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(fs::DirEntry::file_name);
    for entry in entries {
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_symlink() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{} is a symbolic link", entry.path().display()),
            ));
        }
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target)?;
        } else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{} is not a plain file", entry.path().display()),
            ));
        }
    }
    Ok(())
}

fn first_disallowed_entry(
    folder: &Path,
    sprite_relative: &str,
) -> io::Result<Option<(LibraryIssueKind, String)>> {
    let allowed_files = HashSet::from(["pet.json".to_string(), sprite_relative.to_string()]);
    let mut allowed_directories = HashSet::new();
    let sprite_path = Path::new(sprite_relative);
    let mut parent = sprite_path.parent();
    while let Some(path) = parent {
        if path.as_os_str().is_empty() {
            break;
        }
        allowed_directories.insert(normalized_relative(path));
        parent = path.parent();
    }
    inspect_entries(folder, folder, &allowed_files, &allowed_directories)
}

fn inspect_entries(
    root: &Path,
    directory: &Path,
    allowed_files: &HashSet<String>,
    allowed_directories: &HashSet<String>,
) -> io::Result<Option<(LibraryIssueKind, String)>> {
    let mut entries = fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(fs::DirEntry::file_name);
    for entry in entries {
        let relative = entry
            .path()
            .strip_prefix(root)
            .map(normalized_relative)
            .unwrap_or_default();
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            return Ok(Some((LibraryIssueKind::Symlink, relative)));
        }
        if file_type.is_file() {
            if !allowed_files.contains(&relative) {
                return Ok(Some((LibraryIssueKind::UnexpectedEntry, relative)));
            }
            continue;
        }
        if file_type.is_dir() {
            if !allowed_directories.contains(&relative) {
                return Ok(Some((LibraryIssueKind::UnexpectedEntry, relative)));
            }
            if let Some(issue) =
                inspect_entries(root, &entry.path(), allowed_files, allowed_directories)?
            {
                return Ok(Some(issue));
            }
            continue;
        }
        return Ok(Some((LibraryIssueKind::UnexpectedEntry, relative)));
    }
    Ok(None)
}

fn normalized_relative(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn error_issue(folder_name: &str, kind: LibraryIssueKind, detail: &str) -> LibraryIssue {
    LibraryIssue {
        folder_name: folder_name.to_string(),
        severity: LibraryIssueSeverity::Error,
        kind,
        detail: detail.to_string(),
    }
}
