use desktop_pet_core::library::scan_pet_library;
use desktop_pet_core::manifest::{BubbleScene, normalize_asset_path, normalize_pet_manifest};
use std::fs;
use std::path::PathBuf;

#[test]
fn all_twenty_five_existing_pets_are_accepted_by_the_native_contract() {
    let pets_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../pets");
    let native_scan = scan_pet_library(&pets_root).expect("existing library should scan");
    assert_eq!(native_scan.pets.len(), 25);
    assert!(native_scan.issues.is_empty(), "{:?}", native_scan.issues);

    let mut pet_directories = fs::read_dir(&pets_root)
        .expect("pets directory should exist")
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        .collect::<Vec<_>>();
    pet_directories.sort_by_key(|entry| entry.file_name());

    assert_eq!(pet_directories.len(), 25);
    for entry in pet_directories {
        let folder = entry.path();
        let raw = fs::read_to_string(folder.join("pet.json")).expect("manifest should be readable");
        let value = serde_json::from_str(&raw).expect("manifest should be JSON");
        let result = normalize_pet_manifest(&value);
        assert!(
            result.missing_fields.is_empty(),
            "{} is missing {:?}",
            folder.display(),
            result.missing_fields,
        );
        assert!(
            result.invalid_optional_fields.is_empty(),
            "{} has invalid {:?}",
            folder.display(),
            result.invalid_optional_fields,
        );
        let manifest = result.manifest.expect("existing manifest should normalize");
        let sprite = normalize_asset_path(&manifest.spritesheet_path)
            .expect("existing spritesheet path should be safe");
        assert!(folder.join(sprite).is_file());

        let lines = manifest
            .bubble_lines
            .as_ref()
            .expect("existing pets should keep editable bubble lines");
        for scene in BubbleScene::ALL {
            assert!(
                lines
                    .for_scene(scene)
                    .is_some_and(|items| !items.is_empty()),
                "{} is missing {scene:?} lines",
                folder.display(),
            );
        }
    }
}
