#![allow(unsafe_op_in_unsafe_fn)]

#[cfg(windows)]
mod windows_host;

#[cfg(windows)]
pub use windows_host::{report_fatal, run};

#[cfg(not(windows))]
pub fn run() -> Result<(), String> {
    Err("desktop-pet-windows only runs on Windows".to_string())
}

#[cfg(not(windows))]
pub fn report_fatal(_error: &str) {}
