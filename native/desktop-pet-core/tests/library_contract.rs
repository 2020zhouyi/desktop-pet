use desktop_pet_core::library::{
    BUNDLED_PET_SEED_MARKER, LibraryIssueKind, consume_bundled_pet_library, default_pet_id,
    pet_folder_name, scan_pet_library, seed_bundled_pet_library,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn loads_valid_pets_and_quarantines_ambiguous_or_unsafe_folders() {
    let root = temporary_directory("scan");
    fs::create_dir_all(&root).expect("temp root");

    write_pet(&root, "good", "good", "Good", "spritesheet.webp");
    write_pet(
        &root,
        "preferred",
        "jx3-u4e03-u79c0-01",
        "Preferred",
        "spritesheet.webp",
    );
    write_pet(&root, "unsafe", "unsafe", "Unsafe", "../outside.webp");
    write_pet(
        &root,
        "duplicate-a",
        "duplicate",
        "Duplicate A",
        "spritesheet.webp",
    );
    write_pet(
        &root,
        "duplicate-b",
        "duplicate",
        "Duplicate B",
        "spritesheet.webp",
    );
    write_pet(&root, "extra", "extra", "Extra", "spritesheet.webp");
    fs::write(root.join("extra").join("notes.txt"), "not allowed").expect("extra file");

    let scan = scan_pet_library(&root).expect("library should scan");
    assert_eq!(
        scan.pets
            .iter()
            .map(|pet| pet.runtime_id.as_str())
            .collect::<Vec<_>>(),
        vec!["user:jx3-u4e03-u79c0-01", "user:good"],
    );
    assert_eq!(default_pet_id(&scan.pets), Some("user:jx3-u4e03-u79c0-01"),);
    assert!(scan.issues.iter().any(|issue| {
        issue.folder_name == "unsafe" && issue.kind == LibraryIssueKind::UnsafeAssetPath
    }));
    assert!(scan.issues.iter().any(|issue| {
        issue.folder_name == "extra" && issue.kind == LibraryIssueKind::UnexpectedEntry
    }));
    assert_eq!(
        scan.issues
            .iter()
            .filter(|issue| issue.kind == LibraryIssueKind::DuplicateId)
            .count(),
        2,
    );

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn malformed_custom_pets_do_not_prevent_valid_pets_from_loading() {
    let root = temporary_directory("malformed");
    fs::create_dir_all(&root).expect("temp root");
    write_pet(&root, "good", "good", "Good", "spritesheet.webp");
    fs::create_dir(root.join("missing-manifest")).expect("missing manifest folder");
    fs::create_dir(root.join("broken-json")).expect("broken manifest folder");
    fs::write(root.join("broken-json").join("pet.json"), "{broken").expect("broken JSON");

    let scan = scan_pet_library(&root).expect("library should scan");
    assert_eq!(scan.pets.len(), 1);
    assert_eq!(scan.pets[0].runtime_id, "user:good");
    assert!(
        scan.issues
            .iter()
            .any(|issue| issue.kind == LibraryIssueKind::MissingManifest),
    );
    assert!(
        scan.issues
            .iter()
            .any(|issue| issue.kind == LibraryIssueKind::InvalidJson),
    );

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn bundled_pets_seed_once_and_player_deletions_are_not_restored() {
    assert_eq!(pet_folder_name("七秀 Codex Pet 1", "fallback"), "七秀");
    assert_eq!(pet_folder_name("阿史那/承庆", "fallback"), "阿史那－承庆");

    let root = temporary_directory("seed");
    let bundled = root.join("bundled");
    let library = root.join("library");
    fs::create_dir_all(&bundled).expect("bundled root");
    fs::create_dir_all(&library).expect("library root");
    write_pet(&bundled, "alpha", "alpha", "甲", "spritesheet.webp");
    write_pet(&bundled, "beta", "beta", "乙", "spritesheet.webp");
    fs::create_dir(library.join("乙")).expect("player-owned conflict");
    fs::write(library.join("乙").join("keep.txt"), "player-owned").expect("player file");

    let first = seed_bundled_pet_library(&bundled, &library).expect("first seed");
    assert!(first.seeded);
    assert_eq!(first.copied_folders, vec!["甲"]);
    assert_eq!(first.preserved_folders, vec!["乙"]);
    assert!(library.join(BUNDLED_PET_SEED_MARKER).is_file());
    assert!(library.join("甲").join("pet.json").is_file());
    assert_eq!(
        fs::read_to_string(library.join("乙").join("keep.txt")).expect("player file"),
        "player-owned",
    );

    fs::remove_dir_all(library.join("甲")).expect("player deletes seeded pet");
    let second = seed_bundled_pet_library(&bundled, &library).expect("second seed");
    assert!(!second.seeded);
    assert!(second.copied_folders.is_empty());
    assert!(!library.join("甲").exists());

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[test]
fn packaged_bundled_pets_are_consumed_once_without_overwriting_player_folders() {
    let root = temporary_directory("consume");
    let bundled = root.join("pets-seed");
    let library = root.join("library");
    fs::create_dir_all(&bundled).expect("bundled root");
    fs::create_dir_all(&library).expect("library root");
    write_pet(&bundled, "alpha", "alpha", "甲", "spritesheet.webp");
    write_pet(&bundled, "beta", "beta", "乙", "spritesheet.webp");
    fs::create_dir(library.join("乙")).expect("player-owned conflict");
    fs::write(library.join("乙").join("keep.txt"), "player-owned").expect("player file");

    let first = consume_bundled_pet_library(&bundled, &library).expect("first consume");
    assert!(first.consumed);
    assert_eq!(first.moved_folders, vec!["甲"]);
    assert_eq!(first.preserved_folders, vec!["乙"]);
    assert!(library.join(BUNDLED_PET_SEED_MARKER).is_file());
    assert!(library.join("甲").join("pet.json").is_file());
    assert_eq!(
        fs::read_to_string(library.join("乙").join("keep.txt")).expect("player file"),
        "player-owned",
    );
    assert!(!bundled.exists());

    fs::remove_dir_all(library.join("甲")).expect("player deletes consumed pet");
    fs::create_dir_all(&bundled).expect("stale bundled root");
    write_pet(&bundled, "alpha", "alpha", "甲", "spritesheet.webp");
    let second = consume_bundled_pet_library(&bundled, &library).expect("second consume");
    assert!(!second.consumed);
    assert!(second.moved_folders.is_empty());
    assert!(!library.join("甲").exists());
    assert!(!bundled.exists());

    fs::remove_dir_all(root).expect("temp cleanup");
}

#[cfg(unix)]
#[test]
fn consuming_from_a_read_only_source_falls_back_to_copy_without_blocking_startup() {
    use std::os::unix::fs::PermissionsExt;

    let root = temporary_directory("consume-read-only");
    let bundled = root.join("pets-seed");
    let library = root.join("library");
    fs::create_dir_all(&bundled).expect("bundled root");
    fs::create_dir_all(&library).expect("library root");
    write_pet(&bundled, "alpha", "alpha", "甲", "spritesheet.webp");
    fs::set_permissions(&bundled, fs::Permissions::from_mode(0o555))
        .expect("read-only bundled root");

    let result = consume_bundled_pet_library(&bundled, &library).expect("copy fallback");
    assert!(result.consumed);
    assert_eq!(result.moved_folders, vec!["甲"]);
    assert!(library.join("甲").join("pet.json").is_file());
    assert!(library.join(BUNDLED_PET_SEED_MARKER).is_file());

    fs::set_permissions(&bundled, fs::Permissions::from_mode(0o755))
        .expect("restore bundled permissions");
    fs::remove_dir_all(root).expect("temp cleanup");
}

fn write_pet(root: &Path, folder: &str, id: &str, display_name: &str, sprite_path: &str) {
    let pet = root.join(folder);
    fs::create_dir_all(&pet).expect("pet folder");
    fs::write(
        pet.join("pet.json"),
        format!(
            r#"{{"id":"{id}","displayName":"{display_name}","spritesheetPath":"{sprite_path}"}}"#,
        ),
    )
    .expect("pet manifest");
    if !sprite_path.contains("..") {
        let sprite = pet.join(sprite_path.replace('\\', "/"));
        fs::create_dir_all(sprite.parent().expect("sprite parent")).expect("sprite parent");
        fs::write(sprite, "sprite").expect("sprite fixture");
    }
}

fn temporary_directory(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "desktop-pet-native-{label}-{}-{nonce}",
        std::process::id(),
    ))
}
