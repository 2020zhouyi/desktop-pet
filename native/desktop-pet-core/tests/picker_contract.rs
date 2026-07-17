use desktop_pet_core::library::PetRecord;
use desktop_pet_core::manifest::PetManifest;
use desktop_pet_core::picker::{PICKER_PAGE_SIZE, PickerState};
use std::path::PathBuf;

#[test]
fn picker_keeps_preview_and_confirmed_selection_separate() {
    let pets = numbered_pets(10);
    let mut picker = PickerState::new(Some("user:pet-09"));
    picker.sync_pets(&pets);

    let initial = picker.view(&pets);
    assert_eq!(initial.confirmed_pet_id, Some("user:pet-09"));
    assert_eq!(initial.draft_pet_id, Some("user:pet-09"));
    assert_eq!(initial.page_index, 1);
    assert_eq!(initial.page_count, 2);
    assert_eq!(initial.visible_pets.len(), PICKER_PAGE_SIZE);
    assert_eq!(initial.visible_pets[0].runtime_id, "user:pet-03");
    assert_eq!(initial.visible_pets[7].runtime_id, "user:pet-10");
    assert_eq!(picker.confirmation_candidate(&pets), None);

    assert!(picker.preview_pet(&pets, "user:pet-02"));
    let preview = picker.view(&pets);
    assert_eq!(preview.confirmed_pet_id, Some("user:pet-09"));
    assert_eq!(preview.draft_pet_id, Some("user:pet-02"));
    assert_eq!(preview.page_index, 0);
    assert_eq!(picker.confirmation_candidate(&pets), Some("user:pet-02"));

    picker.mark_confirmed(&pets, Some("user:pet-02"));
    assert_eq!(picker.confirmation_candidate(&pets), None);
    assert_eq!(picker.view(&pets).confirmed_pet_id, Some("user:pet-02"));
}

#[test]
fn search_matches_display_name_and_runtime_id_and_resets_paging() {
    let mut pets = numbered_pets(18);
    pets[16].manifest.display_name = "七秀 特别伙伴".to_string();
    let mut picker = PickerState::new(Some("user:pet-18"));
    picker.sync_pets(&pets);
    assert_eq!(picker.view(&pets).page_index, 2);

    picker.set_query("  七秀  ");
    let by_name = picker.view(&pets);
    assert_eq!(by_name.page_index, 0);
    assert_eq!(by_name.page_count, 1);
    assert_eq!(by_name.filtered_count, 1);
    assert_eq!(by_name.visible_pets[0].runtime_id, "user:pet-17");

    picker.set_query("PET-0");
    let by_id = picker.view(&pets);
    assert_eq!(by_id.filtered_count, 9);
    assert_eq!(by_id.page_count, 2);
    assert_eq!(by_id.visible_pets.len(), PICKER_PAGE_SIZE);

    picker.next_page(&pets);
    assert_eq!(picker.view(&pets).page_index, 1);
    picker.set_query("");
    assert_eq!(picker.view(&pets).page_index, 0);
}

#[test]
fn library_refresh_drops_stale_draft_and_confirmed_ids_safely() {
    let pets = numbered_pets(3);
    let mut picker = PickerState::new(Some("user:missing"));
    picker.sync_pets(&pets);
    assert_eq!(picker.view(&pets).confirmed_pet_id, None);
    assert_eq!(picker.view(&pets).draft_pet_id, None);
    assert!(!picker.preview_pet(&pets, "user:not-present"));

    picker.mark_confirmed(&pets, Some("user:pet-03"));
    assert_eq!(picker.view(&pets).draft_pet_id, Some("user:pet-03"));

    let reduced = pets[..2].to_vec();
    picker.sync_pets(&reduced);
    assert_eq!(picker.view(&reduced).confirmed_pet_id, None);
    assert_eq!(picker.view(&reduced).draft_pet_id, None);
    assert_eq!(picker.confirmation_candidate(&reduced), None);
}

fn numbered_pets(count: usize) -> Vec<PetRecord> {
    (1..=count)
        .map(|number| {
            let id = format!("pet-{number:02}");
            let folder = PathBuf::from(format!("/pets/{id}"));
            PetRecord {
                runtime_id: format!("user:{id}"),
                spritesheet: folder.join("spritesheet.webp"),
                folder,
                manifest: PetManifest {
                    id,
                    display_name: format!("伙伴 {number:02}"),
                    description: None,
                    spritesheet_path: "spritesheet.webp".to_string(),
                    author: None,
                    version: None,
                    tags: None,
                    faction: None,
                    recommended_scale: None,
                    accent_color: None,
                    behavior_profile: None,
                    bubble_lines: None,
                },
            }
        })
        .collect()
}
