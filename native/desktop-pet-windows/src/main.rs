#![cfg_attr(all(windows, not(test)), windows_subsystem = "windows")]

#[cfg(windows)]
fn main() {
    if let Err(error) = desktop_pet_windows::run() {
        desktop_pet_windows::report_fatal(&error);
        std::process::exit(1);
    }
}

#[cfg(not(windows))]
fn main() {
    println!("desktop-pet-windows is a Windows-only application");
}
