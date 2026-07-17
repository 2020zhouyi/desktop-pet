use desktop_pet_core::animation::{CELL_HEIGHT, CELL_WIDTH};
use desktop_pet_core::state::PetState;
use desktop_pet_render::{
    ALPHA_HIT_THRESHOLD, Atlas, RenderedFrame, RgbaImage, decode_first_valid_atlas,
};
use image::ImageEncoder;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

const TEST_ATLAS: &[u8] = include_bytes!("../../../pets/jx3-u4e03-u79c0-01/spritesheet.webp");

#[test]
fn renders_every_existing_state_with_the_shared_timeline() {
    let atlas = Atlas::decode_webp(TEST_ATLAS).expect("existing atlas should decode");
    assert_eq!(atlas.dimensions(), (1_536, 1_872));

    let expectations = [
        (PetState::Idle, 6, Some(0)),
        (PetState::RunningRight, 8, Some(0)),
        (PetState::RunningLeft, 8, Some(0)),
        (PetState::Waving, 18, Some(12)),
        (PetState::Jumping, 21, Some(15)),
    ];
    for (state, frame_count, loop_start_index) in expectations {
        let rendered = atlas.render_sequence(state, 120, 96, false);
        assert_eq!(rendered.frames.len(), frame_count);
        assert_eq!(rendered.loop_start_index, loop_start_index);
        assert!(rendered.frames.iter().all(|frame| frame.width() == 120));
        assert!(rendered.frames.iter().all(|frame| frame.height() == 130));
    }
}

#[test]
fn caches_repeated_action_cells_and_preserves_alpha_hit_testing() {
    let atlas = Atlas::decode_webp(TEST_ATLAS).expect("existing atlas should decode");
    let waving = atlas.render_sequence(PetState::Waving, 120, 144, false);
    assert!(Arc::ptr_eq(&waving.frames[0].rgba, &waving.frames[4].rgba));
    assert!(Arc::ptr_eq(&waving.frames[0].rgba, &waving.frames[8].rgba));
    assert_eq!(
        (waving.frames[0].width(), waving.frames[0].height()),
        (180, 195)
    );

    let frame = &waving.frames[0];
    let hit_pixels = frame
        .rgba
        .pixels()
        .filter(|pixel| pixel.0[3] > ALPHA_HIT_THRESHOLD)
        .count();
    assert!(hit_pixels > 0);
    assert!(hit_pixels < (frame.width() * frame.height()) as usize);
    assert!(!frame.hit_test(0, 0));
    let bounds = frame.hit_bounds().expect("visible sprite bounds");
    assert!(bounds.left >= 0 && bounds.top >= 0);
    assert!(bounds.right <= frame.width() as i32);
    assert!(bounds.bottom <= frame.height() as i32);
    assert!(bounds.width() > 0 && bounds.height() > 0);
}

#[test]
fn reports_tight_alpha_hit_bounds_for_resize_affordances() {
    let mut rgba = RgbaImage::new(12, 10);
    rgba.put_pixel(3, 2, image::Rgba([10, 20, 30, ALPHA_HIT_THRESHOLD + 1]));
    rgba.put_pixel(8, 7, image::Rgba([10, 20, 30, 255]));
    let frame = RenderedFrame {
        rgba: Arc::new(rgba),
        duration_ms: 100,
    };
    assert_eq!(
        frame.hit_bounds(),
        Some(desktop_pet_core::geometry::RectI {
            left: 3,
            top: 2,
            right: 9,
            bottom: 8,
        })
    );
    assert_eq!(
        RenderedFrame {
            rgba: Arc::new(RgbaImage::new(4, 4)),
            duration_ms: 100,
        }
        .hit_bounds(),
        None
    );
}

#[test]
fn reduced_motion_uses_only_the_first_frame_without_a_loop() {
    let atlas = Atlas::decode_webp(TEST_ATLAS).expect("existing atlas should decode");
    let rendered = atlas.render_sequence(PetState::RunningLeft, 120, 96, true);
    assert_eq!(rendered.frames.len(), 1);
    assert_eq!(rendered.loop_start_index, None);
}

#[test]
fn all_twenty_five_shipped_webp_files_match_the_native_atlas_contract() {
    let pets_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../pets");
    let mut spritesheets = fs::read_dir(pets_root)
        .expect("pets root")
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path().join("spritesheet.webp"))
        .collect::<Vec<_>>();
    spritesheets.sort();
    assert_eq!(spritesheets.len(), 25);

    for path in spritesheets {
        let bytes = fs::read(&path).expect("spritesheet bytes");
        let atlas = Atlas::decode_webp(&bytes)
            .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        assert_eq!(atlas.cell_dimensions(), (CELL_WIDTH, CELL_HEIGHT));
    }
}

#[test]
fn a_corrupt_selected_atlas_falls_through_to_the_next_decodable_pet() {
    let root =
        std::env::temp_dir().join(format!("desktop-pet-atlas-fallback-{}", std::process::id(),));
    fs::create_dir_all(&root).expect("fallback fixture root");
    let corrupt = root.join("corrupt.webp");
    let valid = root.join("valid.webp");
    fs::write(&corrupt, "not a webp").expect("corrupt atlas");
    fs::write(&valid, TEST_ATLAS).expect("valid atlas");

    let decoded = decode_first_valid_atlas([
        ("user:corrupt", corrupt.as_path()),
        ("user:valid", valid.as_path()),
    ])
    .expect("fallback atlas");
    assert_eq!(decoded.runtime_id, "user:valid");
    assert_eq!(decoded.path, valid);
    assert_eq!(decoded.rejected.len(), 1);
    assert_eq!(decoded.rejected[0].runtime_id, "user:corrupt");
    assert_eq!(decoded.atlas.dimensions(), (1_536, 1_872));

    fs::remove_dir_all(root).expect("fallback fixture cleanup");
}

#[test]
fn decodes_png_and_svg_atlases_from_the_existing_resource_contract() {
    let root =
        std::env::temp_dir().join(format!("desktop-pet-atlas-formats-{}", std::process::id()));
    fs::create_dir_all(&root).expect("format fixture root");

    let png = root.join("spritesheet.PNG");
    let rgba = RgbaImage::from_pixel(
        CELL_WIDTH * 8,
        CELL_HEIGHT * 9,
        image::Rgba([10, 20, 30, 128]),
    );
    let mut encoded = Vec::new();
    image::codecs::png::PngEncoder::new(&mut encoded)
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            image::ExtendedColorType::Rgba8,
        )
        .expect("encode PNG fixture");
    fs::write(&png, encoded).expect("write PNG fixture");
    let png_atlas = Atlas::decode_path(&png).expect("PNG atlas should decode");
    assert_eq!(png_atlas.dimensions(), (1_536, 1_872));

    let svg = root.join("spritesheet.svg");
    fs::write(
        &svg,
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1872" viewBox="0 0 1536 1872"><rect width="1536" height="1872" fill="#ff0000" fill-opacity="0.5"/></svg>"##,
    )
    .expect("write SVG fixture");
    let svg_atlas = Atlas::decode_path(&svg).expect("SVG atlas should decode");
    let frame = svg_atlas
        .render_sequence(PetState::Idle, CELL_WIDTH as i32, 96, true)
        .frames
        .remove(0);
    let pixel = frame.rgba.get_pixel(0, 0).0;
    assert_eq!(pixel[0], 255, "SVG RGB must be straight, not premultiplied");
    assert!((127..=128).contains(&pixel[3]));

    fs::remove_dir_all(root).expect("format fixture cleanup");
}
