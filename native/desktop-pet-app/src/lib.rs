#![forbid(unsafe_code)]

//! Filesystem-backed lifecycle host shared by the Windows executable and tests.

use desktop_pet_core::geometry::DEFAULT_MASCOT_WIDTH;
use desktop_pet_core::library::{
    ConsumeResult, LibraryIssue, PetRecord, SeedResult, consume_bundled_pet_library,
    default_pet_id, scan_pet_library, seed_bundled_pet_library,
};
use desktop_pet_core::preferences::{
    PREFERENCES_FILE_NAME, PetPreferences, migrate_selected_pet_id, parse_preferences,
    serialize_preferences,
};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const LEGACY_ELECTRON_IMPORT_MARKER: &str = ".electron-user-data-imported-v1.json";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AppPaths {
    pub data_root: PathBuf,
    pub pets_root: PathBuf,
    pub preferences_file: PathBuf,
    pub log_file: PathBuf,
}

impl AppPaths {
    pub fn for_data_root(data_root: impl AsRef<Path>) -> Self {
        let data_root = data_root.as_ref().to_path_buf();
        Self {
            pets_root: data_root.join("pets"),
            preferences_file: data_root.join(PREFERENCES_FILE_NAME),
            log_file: data_root.join("desktop-pet.log"),
            data_root,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct AppBootstrap {
    pub pets: Vec<PetRecord>,
    pub library_issues: Vec<LibraryIssue>,
    pub preferences: PetPreferences,
    pub bundled_library: BundledLibraryInit,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub enum BundledLibraryInit {
    #[default]
    None,
    Seeded(SeedResult),
    Consumed(ConsumeResult),
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LegacyImportResult {
    pub imported: bool,
    pub settings_copied: bool,
    pub seed_marker_copied: bool,
    pub copied_folders: Vec<String>,
    pub preserved_folders: Vec<String>,
    pub skipped_folders: Vec<String>,
    pub issues: Vec<String>,
}

impl AppBootstrap {
    pub fn selected_pet_id(&self) -> Option<&str> {
        self.preferences.selected_pet_id.as_deref()
    }

    pub fn selected_pet(&self) -> Option<&PetRecord> {
        let selected_pet_id = self.selected_pet_id()?;
        self.pets
            .iter()
            .find(|pet| pet.runtime_id == selected_pet_id)
    }

    pub fn mascot_width_px(&self) -> i32 {
        self.preferences
            .mascot_width_px
            .unwrap_or(DEFAULT_MASCOT_WIDTH)
    }
}

pub fn bootstrap(paths: &AppPaths, bundled_seed: Option<&Path>) -> io::Result<AppBootstrap> {
    bootstrap_with_mode(paths, bundled_seed, BundledLibraryMode::Seed)
}

pub fn bootstrap_packaged(
    paths: &AppPaths,
    bundled_seed: Option<&Path>,
) -> io::Result<AppBootstrap> {
    bootstrap_with_mode(paths, bundled_seed, BundledLibraryMode::Consume)
}

pub fn import_legacy_electron_data(
    legacy_root: &Path,
    paths: &AppPaths,
) -> io::Result<LegacyImportResult> {
    if !legacy_root.is_dir() || same_directory(legacy_root, &paths.data_root) {
        return Ok(LegacyImportResult::default());
    }
    fs::create_dir_all(&paths.data_root)?;
    fs::create_dir_all(&paths.pets_root)?;
    let import_marker = paths.data_root.join(LEGACY_ELECTRON_IMPORT_MARKER);
    if import_marker.exists() {
        return Ok(LegacyImportResult::default());
    }

    let mut result = LegacyImportResult {
        imported: true,
        ..LegacyImportResult::default()
    };
    let legacy_preferences = legacy_root.join(PREFERENCES_FILE_NAME);
    if legacy_preferences.exists() && !paths.preferences_file.exists() {
        match copy_plain_file_staged(
            &legacy_preferences,
            &paths.preferences_file,
            &paths.data_root,
            "settings",
        ) {
            Ok(()) => result.settings_copied = true,
            Err(error) => result
                .issues
                .push(format!("settings import failed: {error}")),
        }
    }

    let legacy_pets = legacy_root.join("pets");
    if legacy_pets.is_dir() {
        let legacy_seed_marker =
            legacy_pets.join(desktop_pet_core::library::BUNDLED_PET_SEED_MARKER);
        let native_seed_marker = paths
            .pets_root
            .join(desktop_pet_core::library::BUNDLED_PET_SEED_MARKER);
        if legacy_seed_marker.exists() && !native_seed_marker.exists() {
            match copy_plain_file_staged(
                &legacy_seed_marker,
                &native_seed_marker,
                &paths.pets_root,
                "seed-marker",
            ) {
                Ok(()) => result.seed_marker_copied = true,
                Err(error) => result
                    .issues
                    .push(format!("seed marker import failed: {error}")),
            }
        }

        let mut entries = fs::read_dir(&legacy_pets)?.collect::<Result<Vec<_>, _>>()?;
        entries.sort_by_key(fs::DirEntry::file_name);
        for entry in entries {
            let folder_name = entry.file_name().to_string_lossy().into_owned();
            if folder_name.starts_with('.') {
                continue;
            }
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    result.skipped_folders.push(folder_name.clone());
                    result
                        .issues
                        .push(format!("{folder_name}: metadata failed: {error}"));
                    continue;
                }
            };
            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }
            let destination = paths.pets_root.join(&folder_name);
            if destination.exists() {
                result.preserved_folders.push(folder_name);
                continue;
            }
            match copy_directory_staged(&entry.path(), &destination, &paths.pets_root, &folder_name)
            {
                Ok(()) => result.copied_folders.push(folder_name),
                Err(error) => {
                    result.skipped_folders.push(folder_name.clone());
                    result.issues.push(format!("{folder_name}: {error}"));
                }
            }
        }
    }

    let marker = serde_json::to_string_pretty(&serde_json::json!({
        "copiedFolders": result.copied_folders,
        "preservedFolders": result.preserved_folders,
        "skippedFolders": result.skipped_folders,
        "settingsCopied": result.settings_copied,
        "seedMarkerCopied": result.seed_marker_copied,
    }))
    .map_err(io::Error::other)?;
    fs::write(import_marker, format!("{marker}\n"))?;
    Ok(result)
}

#[derive(Clone, Copy)]
enum BundledLibraryMode {
    Seed,
    Consume,
}

fn bootstrap_with_mode(
    paths: &AppPaths,
    bundled_seed: Option<&Path>,
    mode: BundledLibraryMode,
) -> io::Result<AppBootstrap> {
    fs::create_dir_all(&paths.data_root)?;
    fs::create_dir_all(&paths.pets_root)?;
    let bundled_library = match (mode, bundled_seed.filter(|root| root.is_dir())) {
        (BundledLibraryMode::Seed, Some(root)) => {
            BundledLibraryInit::Seeded(seed_bundled_pet_library(root, &paths.pets_root)?)
        }
        (BundledLibraryMode::Consume, Some(root)) => {
            BundledLibraryInit::Consumed(consume_bundled_pet_library(root, &paths.pets_root)?)
        }
        (_, None) => BundledLibraryInit::None,
    };
    let scan = scan_pet_library(&paths.pets_root)?;
    let stored_preferences = load_preferences(&paths.preferences_file)?;
    let stored_selected_pet_id = stored_preferences.selected_pet_id.clone();
    let migrated_selected_pet_id = migrate_selected_pet_id(stored_selected_pet_id.clone());
    let selected_pet_id = migrated_selected_pet_id
        .filter(|selected| scan.pets.iter().any(|pet| pet.runtime_id == *selected))
        .or_else(|| default_pet_id(&scan.pets).map(str::to_string));

    let mut preferences = stored_preferences;
    preferences.selected_pet_id = selected_pet_id;
    if stored_selected_pet_id != preferences.selected_pet_id {
        save_preferences(&paths.preferences_file, &preferences)?;
    }

    Ok(AppBootstrap {
        pets: scan.pets,
        library_issues: scan.issues,
        preferences,
        bundled_library,
    })
}

pub fn refresh_pet_library(paths: &AppPaths, app: &mut AppBootstrap) -> io::Result<()> {
    let scan = scan_pet_library(&paths.pets_root)?;
    let current_selected_pet_id = app.preferences.selected_pet_id.clone();
    let selected_pet_id = current_selected_pet_id
        .as_deref()
        .filter(|selected| scan.pets.iter().any(|pet| pet.runtime_id == *selected))
        .map(str::to_string)
        .or_else(|| default_pet_id(&scan.pets).map(str::to_string));

    let mut next_preferences = app.preferences.clone();
    next_preferences.selected_pet_id = selected_pet_id;
    if next_preferences != app.preferences {
        save_preferences(&paths.preferences_file, &next_preferences)?;
    }

    app.pets = scan.pets;
    app.library_issues = scan.issues;
    app.preferences = next_preferences;
    Ok(())
}

pub fn select_pet(
    paths: &AppPaths,
    app: &mut AppBootstrap,
    runtime_id: &str,
) -> io::Result<Option<PetRecord>> {
    let Some(selected) = app
        .pets
        .iter()
        .find(|pet| pet.runtime_id == runtime_id)
        .cloned()
    else {
        return Ok(None);
    };
    if app.selected_pet_id() == Some(runtime_id) {
        return Ok(Some(selected));
    }

    let mut next_preferences = app.preferences.clone();
    next_preferences.selected_pet_id = Some(runtime_id.to_string());
    save_preferences(&paths.preferences_file, &next_preferences)?;
    app.preferences = next_preferences;
    Ok(Some(selected))
}

pub fn set_launch_at_login(
    paths: &AppPaths,
    app: &mut AppBootstrap,
    enabled: bool,
) -> io::Result<()> {
    if app.preferences.launch_at_login == enabled {
        return Ok(());
    }
    let mut next_preferences = app.preferences.clone();
    next_preferences.launch_at_login = enabled;
    save_preferences(&paths.preferences_file, &next_preferences)?;
    app.preferences = next_preferences;
    Ok(())
}

pub fn load_preferences(path: &Path) -> io::Result<PetPreferences> {
    match fs::read_to_string(path) {
        Ok(serialized) => Ok(parse_preferences(&serialized)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(PetPreferences::default()),
        Err(error) => Err(error),
    }
}

pub fn save_preferences(path: &Path, preferences: &PetPreferences) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let serialized = serialize_preferences(preferences).map_err(io::Error::other)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let staging = path.with_extension(format!("tmp-{}-{nonce}", std::process::id()));
    fs::write(&staging, &serialized)?;
    match fs::rename(&staging, path) {
        Ok(()) => Ok(()),
        Err(_) if path.exists() => {
            let result = fs::write(path, serialized);
            let _ = fs::remove_file(staging);
            result
        }
        Err(error) => {
            let _ = fs::remove_file(staging);
            Err(error)
        }
    }
}

fn same_directory(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

fn copy_plain_file_staged(
    source: &Path,
    destination: &Path,
    staging_root: &Path,
    label: &str,
) -> io::Result<()> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{} is not a plain file", source.display()),
        ));
    }
    let staging = staging_path(staging_root, label);
    let result = fs::copy(source, &staging)
        .map(|_| ())
        .and_then(|()| fs::rename(&staging, destination));
    if result.is_err() {
        let _ = fs::remove_file(staging);
    }
    result
}

fn copy_directory_staged(
    source: &Path,
    destination: &Path,
    staging_root: &Path,
    label: &str,
) -> io::Result<()> {
    let staging = staging_path(staging_root, label);
    let result = copy_directory(source, &staging).and_then(|()| fs::rename(&staging, destination));
    if result.is_err() {
        let _ = fs::remove_dir_all(staging);
    }
    result
}

fn staging_path(root: &Path, label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    root.join(format!(".migrating-{label}-{}-{nonce}", std::process::id(),))
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
        let target = destination.join(entry.file_name());
        let file_type = entry.file_type()?;
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
