use wasm_bindgen::prelude::*;
use web_sys::{WebGlProgram, WebGlRenderingContext, WebGlShader};

const VERT_SHADER: &str = r#"
    attribute vec2 a_position;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
"#;

const FRAG_SHADER: &str = r#"
    precision mediump float;
    void main() {
        gl_FragColor = vec4(0.2, 0.6, 1.0, 1.0);
    }
"#;

#[wasm_bindgen]
pub fn draw() -> Result<(), JsValue> {
    let window = web_sys::window().unwrap();
    let document = window.document().unwrap();

    let canvas = document
        .get_element_by_id("canvas")
        .unwrap()
        .dyn_into::<web_sys::HtmlCanvasElement>()?;

    let gl = canvas
        .get_context("webgl")?
        .unwrap()
        .dyn_into::<WebGlRenderingContext>()?;

    let program = link_program(&gl)?;
    gl.use_program(Some(&program));

    // 6 vertices for 2 triangles making a rectangle in clip space
    let vertices: [f32; 12] = [
        -0.5, -0.5, // bottom-left
         0.5, -0.5, // bottom-right
        -0.5,  0.5, // top-left
        -0.5,  0.5, // top-left
         0.5, -0.5, // bottom-right
         0.5,  0.5, // top-right
    ];

    let buffer = gl.create_buffer().ok_or("failed to create buffer")?;
    gl.bind_buffer(WebGlRenderingContext::ARRAY_BUFFER, Some(&buffer));

    // Upload vertex data to GPU — safety: view into vertices which lives for this scope
    unsafe {
        let vert_array = js_sys::Float32Array::view(&vertices);
        gl.buffer_data_with_array_buffer_view(
            WebGlRenderingContext::ARRAY_BUFFER,
            &vert_array,
            WebGlRenderingContext::STATIC_DRAW,
        );
    }

    let position_loc = gl.get_attrib_location(&program, "a_position") as u32;
    gl.vertex_attrib_pointer_with_i32(position_loc, 2, WebGlRenderingContext::FLOAT, false, 0, 0);
    gl.enable_vertex_attrib_array(position_loc);

    gl.clear_color(0.1, 0.1, 0.1, 1.0);
    gl.clear(WebGlRenderingContext::COLOR_BUFFER_BIT);
    gl.draw_arrays(WebGlRenderingContext::TRIANGLES, 0, 6);

    Ok(())
}

fn compile_shader(gl: &WebGlRenderingContext, shader_type: u32, source: &str) -> Result<WebGlShader, String> {
    let shader = gl.create_shader(shader_type).ok_or("failed to create shader")?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);

    if gl.get_shader_parameter(&shader, WebGlRenderingContext::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(shader)
    } else {
        Err(gl.get_shader_info_log(&shader).unwrap_or_default())
    }
}

fn link_program(gl: &WebGlRenderingContext) -> Result<WebGlProgram, String> {
    let vert = compile_shader(gl, WebGlRenderingContext::VERTEX_SHADER, VERT_SHADER)?;
    let frag = compile_shader(gl, WebGlRenderingContext::FRAGMENT_SHADER, FRAG_SHADER)?;

    let program = gl.create_program().ok_or("failed to create program")?;
    gl.attach_shader(&program, &vert);
    gl.attach_shader(&program, &frag);
    gl.link_program(&program);

    if gl.get_program_parameter(&program, WebGlRenderingContext::LINK_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(program)
    } else {
        Err(gl.get_program_info_log(&program).unwrap_or_default())
    }
}
