use wasm_bindgen::prelude::*;
use serde::Serialize;

// 1. Primitive: no serialisation needed
#[wasm_bindgen]
pub fn add(a: u32, b: u32) -> u32 {
    a + b
}

// 2. String: wasm-bindgen handles UTF-8 encoding
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// 3. Struct: serialise to JsValue via serde
#[wasm_bindgen]
pub fn get_feature() -> JsValue {
    #[derive(Serialize)]
    struct Feature {
        start: u32,
        end: u32,
        name: String,
    }
    let f = Feature {
        start: 1000,
        end: 2000,
        name: "BRCA1".into(),
    };
    serde_wasm_bindgen::to_value(&f).unwrap()
}