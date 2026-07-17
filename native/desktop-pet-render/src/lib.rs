#![forbid(unsafe_code)]

//! Atlas decoding and DPI-aware frame rasterization for native pet windows.

use desktop_pet_core::animation::{
    ATLAS_COLUMNS, ATLAS_ROWS, CELL_HEIGHT, CELL_WIDTH, sequence_for,
};
use desktop_pet_core::geometry::{RectI, SizeI, scaled_size};
use desktop_pet_core::state::PetState;
use image::ImageError;
use image::imageops::FilterType;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub use image::RgbaImage;

pub const ALPHA_HIT_THRESHOLD: u8 = 24;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AtlasCandidateFailure {
    pub runtime_id: String,
    pub path: PathBuf,
    pub detail: String,
}

#[derive(Clone, Debug)]
pub struct DecodedAtlas {
    pub runtime_id: String,
    pub path: PathBuf,
    pub atlas: Atlas,
    pub rejected: Vec<AtlasCandidateFailure>,
}

pub fn decode_first_valid_atlas<'a>(
    candidates: impl IntoIterator<Item = (&'a str, &'a Path)>,
) -> Result<DecodedAtlas, Vec<AtlasCandidateFailure>> {
    let mut rejected = Vec::new();
    for (runtime_id, path) in candidates {
        let atlas = Atlas::decode_path(path);
        match atlas {
            Ok(atlas) => {
                return Ok(DecodedAtlas {
                    runtime_id: runtime_id.to_string(),
                    path: path.to_path_buf(),
                    atlas,
                    rejected,
                });
            }
            Err(detail) => rejected.push(AtlasCandidateFailure {
                runtime_id: runtime_id.to_string(),
                path: path.to_path_buf(),
                detail,
            }),
        }
    }
    Err(rejected)
}

#[derive(Clone, Debug)]
pub struct Atlas {
    rgba: RgbaImage,
}

impl Atlas {
    pub fn decode_path(path: &Path) -> Result<Self, String> {
        let bytes = fs::read(path)
            .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
        match path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("webp") => Self::decode_webp(&bytes).map_err(|error| error.to_string()),
            Some("png") => Self::decode_png(&bytes).map_err(|error| error.to_string()),
            Some("svg") => Self::decode_svg(&bytes),
            extension => Err(format!(
                "unsupported atlas extension: {}",
                extension.unwrap_or("<none>"),
            )),
        }
    }

    pub fn decode_webp(bytes: &[u8]) -> Result<Self, ImageError> {
        let rgba = image::load_from_memory_with_format(bytes, image::ImageFormat::WebP)?.to_rgba8();
        Self::from_rgba(rgba)
    }

    pub fn decode_png(bytes: &[u8]) -> Result<Self, ImageError> {
        let rgba = image::load_from_memory_with_format(bytes, image::ImageFormat::Png)?.to_rgba8();
        Self::from_rgba(rgba)
    }

    pub fn decode_svg(bytes: &[u8]) -> Result<Self, String> {
        let tree = resvg::usvg::Tree::from_data(bytes, &resvg::usvg::Options::default())
            .map_err(|error| format!("invalid SVG atlas: {error}"))?;
        let size = tree.size().to_int_size();
        let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height())
            .ok_or_else(|| "SVG atlas dimensions are invalid".to_string())?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::identity(),
            &mut pixmap.as_mut(),
        );
        let mut rgba = pixmap.take();
        unpremultiply_rgba(&mut rgba);
        let rgba = RgbaImage::from_raw(size.width(), size.height(), rgba)
            .ok_or_else(|| "SVG atlas raster buffer has an invalid length".to_string())?;
        Self::from_rgba(rgba).map_err(|error| error.to_string())
    }

    pub fn from_rgba(rgba: RgbaImage) -> Result<Self, ImageError> {
        if rgba.dimensions() != (ATLAS_COLUMNS * CELL_WIDTH, ATLAS_ROWS * CELL_HEIGHT) {
            return Err(ImageError::Limits(image::error::LimitError::from_kind(
                image::error::LimitErrorKind::DimensionError,
            )));
        }
        Ok(Self { rgba })
    }

    pub fn dimensions(&self) -> (u32, u32) {
        self.rgba.dimensions()
    }

    pub fn cell_dimensions(&self) -> (u32, u32) {
        (CELL_WIDTH, CELL_HEIGHT)
    }

    pub fn render_sequence(
        &self,
        state: PetState,
        logical_width: i32,
        dpi: u32,
        reduced_motion: bool,
    ) -> RenderedSequence {
        let timeline = sequence_for(state, reduced_motion);
        let target = scaled_size(
            logical_width,
            SizeI {
                width: CELL_WIDTH as i32,
                height: CELL_HEIGHT as i32,
            },
            dpi,
        );
        let mut cells = HashMap::<(u32, u32), Arc<RgbaImage>>::new();
        let frames = timeline
            .frames
            .into_iter()
            .map(|frame| {
                let rgba = cells
                    .entry((frame.row, frame.column))
                    .or_insert_with(|| {
                        let source = image::imageops::crop_imm(
                            &self.rgba,
                            frame.column * CELL_WIDTH,
                            frame.row * CELL_HEIGHT,
                            CELL_WIDTH,
                            CELL_HEIGHT,
                        )
                        .to_image();
                        let scaled = if target.width == CELL_WIDTH as i32
                            && target.height == CELL_HEIGHT as i32
                        {
                            source
                        } else {
                            image::imageops::resize(
                                &source,
                                target.width as u32,
                                target.height as u32,
                                FilterType::Nearest,
                            )
                        };
                        Arc::new(scaled)
                    })
                    .clone();
                RenderedFrame {
                    rgba,
                    duration_ms: frame.duration_ms,
                }
            })
            .collect();
        RenderedSequence {
            frames,
            loop_start_index: timeline.loop_start_index,
        }
    }
}

fn unpremultiply_rgba(rgba: &mut [u8]) {
    for pixel in rgba.chunks_exact_mut(4) {
        let alpha = u16::from(pixel[3]);
        if alpha == 0 || alpha == 255 {
            continue;
        }
        for channel in &mut pixel[..3] {
            let straight = (u16::from(*channel) * 255 + alpha / 2) / alpha;
            *channel = straight.min(255) as u8;
        }
    }
}

#[derive(Clone, Debug)]
pub struct RenderedFrame {
    pub rgba: Arc<RgbaImage>,
    pub duration_ms: u32,
}

impl RenderedFrame {
    pub fn width(&self) -> u32 {
        self.rgba.width()
    }

    pub fn height(&self) -> u32 {
        self.rgba.height()
    }

    pub fn alpha_at(&self, x: u32, y: u32) -> u8 {
        if x >= self.width() || y >= self.height() {
            return 0;
        }
        self.rgba.get_pixel(x, y).0[3]
    }

    pub fn hit_test(&self, x: u32, y: u32) -> bool {
        self.alpha_at(x, y) > ALPHA_HIT_THRESHOLD
    }

    pub fn hit_bounds(&self) -> Option<RectI> {
        let mut left = self.width();
        let mut top = self.height();
        let mut right = 0;
        let mut bottom = 0;
        let mut found = false;
        for y in 0..self.height() {
            for x in 0..self.width() {
                if !self.hit_test(x, y) {
                    continue;
                }
                found = true;
                left = left.min(x);
                top = top.min(y);
                right = right.max(x + 1);
                bottom = bottom.max(y + 1);
            }
        }
        found.then_some(RectI {
            left: left as i32,
            top: top as i32,
            right: right as i32,
            bottom: bottom as i32,
        })
    }
}

#[derive(Clone, Debug)]
pub struct RenderedSequence {
    pub frames: Vec<RenderedFrame>,
    pub loop_start_index: Option<usize>,
}
