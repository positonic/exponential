// Prevents an extra console window on Windows in release builds. The shell is
// macOS-only today, but the attribute is free and keeps the door open.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    exponential_beta_lib::run()
}
