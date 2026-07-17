use desktop_pet_app::{
    AppPaths, BundledLibraryInit, LEGACY_ELECTRON_IMPORT_MARKER, bootstrap, bootstrap_packaged,
    import_legacy_electron_data, load_preferences, refresh_pet_library, select_pet,
    set_launch_at_login,
};
use desktop_pet_core::geometry::DEFAULT_MASCOT_WIDTH;
use desktop_pet_core::library::BUNDLED_PET_SEED_MARKER;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn bootstraps_the_writable_library_and_migrates_existing_selection() {
    let root = temporary_directory("bootstrap");
    let seed = root.join("pets-seed");
    let data = root.join("user-data");
    write_pet(&seed, "good-source", "good", "Good");
    write_pet(&seed, "preferred-source", "jx3-u4e03-u79c0-01", "Preferred");
    fs::create_dir_all(&data).expect("user data");
    fs::write(
        data.join("desktop-pet-settings.json"),
        r#"{
          "selectedPetId": "project:good",
          "mascotWidthPx": 180,
          "opacity": 0.5,
          "launchAtLogin": true
        }"#,
    )
    .expect("legacy preferences");

    let paths = AppPaths::for_data_root(&data);
    let state = bootstrap(&paths, Some(&seed)).expect("app bootstrap");
    assert_eq!(state.pets.len(), 2);
    assert_eq!(state.selected_pet_id(), Some("user:good"));
    assert_eq!(state.mascot_width_px(), 180);
    assert!(state.preferences.launch_at_login);
    assert!(matches!(
        state.bundled_library,
        BundledLibraryInit::Seeded(ref result) if result.seeded
    ));

    let stored = fs::read_to_string(&paths.preferences_file).expect("stored preferences");
    assert!(stored.contains("\"selectedPetId\": \"user:good\""));
    assert!(!stored.contains("opacity"));

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn stale_selection_falls_back_and_deleted_seeded_pets_stay_deleted() {
    let root = temporary_directory("selection");
    let seed = root.join("pets-seed");
    let data = root.join("user-data");
    write_pet(&seed, "good-source", "good", "Good");
    write_pet(&seed, "preferred-source", "jx3-u4e03-u79c0-01", "Preferred");
    let paths = AppPaths::for_data_root(&data);

    let first = bootstrap(&paths, Some(&seed)).expect("first bootstrap");
    assert_eq!(first.selected_pet_id(), Some("user:jx3-u4e03-u79c0-01"));
    assert_eq!(first.mascot_width_px(), DEFAULT_MASCOT_WIDTH);
    fs::remove_dir_all(paths.pets_root.join("Preferred")).expect("player deletion");

    let second = bootstrap(&paths, Some(&seed)).expect("second bootstrap");
    assert_eq!(second.pets.len(), 1);
    assert_eq!(second.selected_pet_id(), Some("user:good"));
    assert!(!paths.pets_root.join("Preferred").exists());
    assert!(matches!(
        second.bundled_library,
        BundledLibraryInit::Seeded(ref result) if !result.seeded
    ));
    assert_eq!(
        load_preferences(&paths.preferences_file)
            .expect("preferences")
            .selected_pet_id
            .as_deref(),
        Some("user:good"),
    );

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn missing_or_broken_settings_never_block_startup() {
    let root = temporary_directory("broken-settings");
    let data = root.join("user-data");
    let paths = AppPaths::for_data_root(&data);
    fs::create_dir_all(&paths.pets_root).expect("pets root");
    write_pet(&paths.pets_root, "Good", "good", "Good");
    fs::create_dir_all(&data).expect("data root");
    fs::write(&paths.preferences_file, "{broken").expect("broken settings");

    let state = bootstrap(&paths, None).expect("app bootstrap");
    assert_eq!(state.selected_pet_id(), Some("user:good"));
    assert_eq!(state.mascot_width_px(), DEFAULT_MASCOT_WIDTH);

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn selection_is_persisted_only_for_a_pet_in_the_current_library() {
    let root = temporary_directory("select-pet");
    let data = root.join("user-data");
    let paths = AppPaths::for_data_root(&data);
    fs::create_dir_all(&paths.pets_root).expect("pets root");
    write_pet(&paths.pets_root, "One", "one", "One");
    write_pet(&paths.pets_root, "Two", "two", "Two");
    let mut app = bootstrap(&paths, None).expect("app bootstrap");
    let initial_preferences =
        fs::read_to_string(&paths.preferences_file).expect("initial settings");

    assert_eq!(
        select_pet(&paths, &mut app, "user:missing").expect("invalid selection"),
        None
    );
    assert_eq!(
        fs::read_to_string(&paths.preferences_file).expect("settings unchanged"),
        initial_preferences
    );

    let selected = select_pet(&paths, &mut app, "user:two")
        .expect("valid selection")
        .expect("selected record");
    assert_eq!(selected.runtime_id, "user:two");
    assert_eq!(app.selected_pet_id(), Some("user:two"));
    assert_eq!(
        load_preferences(&paths.preferences_file)
            .expect("stored preferences")
            .selected_pet_id
            .as_deref(),
        Some("user:two")
    );

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn launch_at_login_updates_in_memory_and_on_disk_together() {
    let root = temporary_directory("launch-at-login");
    let data = root.join("user-data");
    let paths = AppPaths::for_data_root(&data);
    fs::create_dir_all(&paths.pets_root).expect("pets root");
    write_pet(&paths.pets_root, "One", "one", "One");
    let mut app = bootstrap(&paths, None).expect("app bootstrap");

    set_launch_at_login(&paths, &mut app, true).expect("enable launch at login");
    assert!(app.preferences.launch_at_login);
    assert!(
        load_preferences(&paths.preferences_file)
            .expect("stored enabled preference")
            .launch_at_login
    );

    set_launch_at_login(&paths, &mut app, false).expect("disable launch at login");
    assert!(!app.preferences.launch_at_login);
    assert!(
        !load_preferences(&paths.preferences_file)
            .expect("stored disabled preference")
            .launch_at_login
    );

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn packaged_bootstrap_consumes_seed_and_never_restores_player_deletions() {
    let root = temporary_directory("packaged-bootstrap");
    let seed = root.join("pets-seed");
    let data = root.join("user-data");
    write_pet(&seed, "preferred-source", "jx3-u4e03-u79c0-01", "Preferred");
    let paths = AppPaths::for_data_root(&data);

    let first = bootstrap_packaged(&paths, Some(&seed)).expect("first packaged bootstrap");
    assert!(matches!(
        first.bundled_library,
        BundledLibraryInit::Consumed(ref result) if result.consumed
    ));
    assert!(!seed.exists());
    assert_eq!(first.selected_pet_id(), Some("user:jx3-u4e03-u79c0-01"));

    fs::remove_dir_all(paths.pets_root.join("Preferred")).expect("player deletion");
    write_pet(&seed, "preferred-source", "jx3-u4e03-u79c0-01", "Preferred");
    let second = bootstrap_packaged(&paths, Some(&seed)).expect("second packaged bootstrap");
    assert!(matches!(
        second.bundled_library,
        BundledLibraryInit::Consumed(ref result) if !result.consumed
    ));
    assert!(!seed.exists());
    assert!(second.pets.is_empty());

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn imports_legacy_electron_settings_pets_and_seed_marker_once_without_deleting_source() {
    let root = temporary_directory("legacy-import");
    let legacy = root.join("electron-user-data");
    let data = root.join("native-user-data");
    let legacy_pets = legacy.join("pets");
    write_pet(&legacy_pets, "Alpha", "alpha", "Alpha");
    fs::write(
        legacy_pets.join(BUNDLED_PET_SEED_MARKER),
        "{\"folders\":[\"alpha\"]}\n",
    )
    .expect("legacy seed marker");
    fs::create_dir_all(&legacy).expect("legacy root");
    fs::write(
        legacy.join("desktop-pet-settings.json"),
        r#"{"selectedPetId":"user:alpha","mascotWidthPx":180,"launchAtLogin":true}"#,
    )
    .expect("legacy settings");
    let paths = AppPaths::for_data_root(&data);

    let first = import_legacy_electron_data(&legacy, &paths).expect("legacy import");
    assert!(first.imported);
    assert!(first.settings_copied);
    assert!(first.seed_marker_copied);
    assert_eq!(first.copied_folders, vec!["Alpha"]);
    assert!(first.preserved_folders.is_empty());
    assert!(first.skipped_folders.is_empty());
    assert!(legacy_pets.join("Alpha").is_dir());
    assert!(paths.pets_root.join("Alpha").is_dir());
    assert!(
        paths
            .data_root
            .join(LEGACY_ELECTRON_IMPORT_MARKER)
            .is_file()
    );

    write_pet(&legacy_pets, "Later", "later", "Later");
    let second = import_legacy_electron_data(&legacy, &paths).expect("second legacy import");
    assert!(!second.imported);
    assert!(!paths.pets_root.join("Later").exists());

    let app = bootstrap(&paths, None).expect("bootstrap imported data");
    assert_eq!(app.selected_pet_id(), Some("user:alpha"));
    assert_eq!(app.mascot_width_px(), 180);
    assert!(app.preferences.launch_at_login);

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn legacy_import_never_overwrites_native_settings_or_pet_folders() {
    let root = temporary_directory("legacy-conflicts");
    let legacy = root.join("electron-user-data");
    let data = root.join("native-user-data");
    let paths = AppPaths::for_data_root(&data);
    write_pet(
        &legacy.join("pets"),
        "Alpha",
        "legacy-alpha",
        "Legacy Alpha",
    );
    write_pet(&legacy.join("pets"), "Beta", "beta", "Beta");
    fs::create_dir_all(&legacy).expect("legacy root");
    fs::write(
        legacy.join("desktop-pet-settings.json"),
        r#"{"selectedPetId":"user:legacy-alpha","mascotWidthPx":84,"launchAtLogin":true}"#,
    )
    .expect("legacy settings");
    write_pet(&paths.pets_root, "Alpha", "native-alpha", "Native Alpha");
    fs::create_dir_all(&paths.data_root).expect("native root");
    fs::write(
        &paths.preferences_file,
        r#"{"selectedPetId":"user:native-alpha","mascotWidthPx":228,"launchAtLogin":false}"#,
    )
    .expect("native settings");

    let result = import_legacy_electron_data(&legacy, &paths).expect("legacy import");
    assert!(result.imported);
    assert!(!result.settings_copied);
    assert_eq!(result.copied_folders, vec!["Beta"]);
    assert_eq!(result.preserved_folders, vec!["Alpha"]);
    assert!(paths.pets_root.join("Beta").is_dir());
    assert!(
        fs::read_to_string(paths.pets_root.join("Alpha").join("pet.json"))
            .expect("native pet")
            .contains("native-alpha")
    );

    let app = bootstrap(&paths, None).expect("bootstrap native data");
    assert_eq!(app.selected_pet_id(), Some("user:native-alpha"));
    assert_eq!(app.mascot_width_px(), 228);
    assert!(!app.preferences.launch_at_login);

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn refreshing_the_library_discovers_new_pets_and_persists_a_deleted_selection_fallback() {
    let root = temporary_directory("library-refresh");
    let data = root.join("native-user-data");
    let paths = AppPaths::for_data_root(&data);
    write_pet(&paths.pets_root, "Alpha", "alpha", "Alpha");
    let mut app = bootstrap(&paths, None).expect("initial bootstrap");
    assert_eq!(app.selected_pet_id(), Some("user:alpha"));

    write_pet(&paths.pets_root, "Beta", "beta", "Beta");
    refresh_pet_library(&paths, &mut app).expect("discover added pet");
    assert_eq!(app.pets.len(), 2);
    assert_eq!(app.selected_pet_id(), Some("user:alpha"));

    fs::remove_dir_all(paths.pets_root.join("Alpha")).expect("delete selected pet");
    refresh_pet_library(&paths, &mut app).expect("fallback after deletion");
    assert_eq!(app.pets.len(), 1);
    assert_eq!(app.selected_pet_id(), Some("user:beta"));
    assert_eq!(
        load_preferences(&paths.preferences_file)
            .expect("stored fallback")
            .selected_pet_id
            .as_deref(),
        Some("user:beta"),
    );

    fs::remove_dir_all(root).expect("temp cleanup");
}

fn write_pet(root: &Path, folder: &str, id: &str, display_name: &str) {
    let pet = root.join(folder);
    fs::create_dir_all(&pet).expect("pet folder");
    fs::write(
        pet.join("pet.json"),
        format!(
            r#"{{"id":"{id}","displayName":"{display_name}","spritesheetPath":"spritesheet.webp","bubbleLines":{{"welcome":["欢迎"],"click":["点击"],"drag":["拖拽"],"petSwitch":["切换"]}}}}"#,
        ),
    )
    .expect("manifest");
    fs::write(pet.join("spritesheet.webp"), "sprite").expect("sprite");
}

fn temporary_directory(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "desktop-pet-app-{label}-{}-{nonce}",
        std::process::id(),
    ))
}
