use wasm_bindgen::prelude::*;
use web_sys::{WebGlBuffer, WebGlProgram, WebGlRenderingContext as GL, WebGlUniformLocation};
use crate::parser::{Feature, Strand};

// --- GLSL Shaders ---

const VERT_SHADER: &str = r#"
    attribute vec2 a_position;
    attribute vec3 a_color;
    uniform vec2 u_resolution;
    varying vec3 v_color;
    void main() {
        // Convert pixel coords [0, resolution] to clip space [-1, 1]
        vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
        // Flip Y: pixel y=0 is top, clip y=+1 is top
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        v_color = a_color;
    }
"#;

const FRAG_SHADER: &str = r#"
    precision mediump float;
    varying vec3 v_color;
    void main() {
        gl_FragColor = vec4(v_color, 1.0);
    }
"#;

// --- Renderer ---

#[wasm_bindgen]
pub struct Renderer {
    gl: GL,
    program: WebGlProgram,
    vertex_buffer: WebGlBuffer,
    position_loc: u32,
    color_loc: u32,
    resolution_loc: WebGlUniformLocation,
}

#[wasm_bindgen]
impl Renderer {
    #[wasm_bindgen(constructor)]
    pub fn new(gl: GL) -> Result<Renderer, JsValue> {
        let program = link_program(&gl).map_err(|e| JsValue::from_str(&e))?;

        let vertex_buffer = gl
            .create_buffer()
            .ok_or_else(|| JsValue::from_str("failed to create vertex buffer"))?;

        let position_loc = gl.get_attrib_location(&program, "a_position") as u32;
        let color_loc = gl.get_attrib_location(&program, "a_color") as u32;

        let resolution_loc = gl
            .get_uniform_location(&program, "u_resolution")
            .ok_or_else(|| JsValue::from_str("failed to get u_resolution uniform"))?;

        gl.use_program(Some(&program));

        Ok(Renderer { gl, program, vertex_buffer, position_loc, color_loc, resolution_loc })
    }

    pub fn render(
        &self,
        features: JsValue,
        viewport_start: u32,
        viewport_end: u32,
        canvas_width: f32,
        canvas_height: f32,
    ) -> Result<(), JsValue> {
        if viewport_end <= viewport_start || canvas_width <= 0.0 || canvas_height <= 0.0 {
            return Ok(());
        }

        let features: Vec<Feature> = if features.is_null() || features.is_undefined() {
            vec![]
        } else {
            serde_wasm_bindgen::from_value(features)
                .map_err(|e| JsValue::from_str(&e.to_string()))?
        };

        let gl = &self.gl;

        gl.viewport(0, 0, canvas_width as i32, canvas_height as i32);
        gl.clear_color(0.12, 0.12, 0.15, 1.0);
        gl.clear(GL::COLOR_BUFFER_BIT);

        gl.use_program(Some(&self.program));
        gl.uniform2f(Some(&self.resolution_loc), canvas_width, canvas_height);

        let mut vertices: Vec<f32> = Vec::new();

        // Ruler track
        build_ruler_vertices(&mut vertices, viewport_start, viewport_end, canvas_width);

        // Feature quads
        let row_assignments = pack_rows(&features);
        const RULER_HEIGHT: f32 = 30.0;
        const ROW_HEIGHT: f32 = 20.0;
        const PADDING: f32 = 2.0;

        for (feature, row) in features.iter().zip(row_assignments.iter()) {
            let x1 = genomic_to_screen(feature.start, viewport_start, viewport_end, canvas_width);
            let x2 = genomic_to_screen(feature.end, viewport_start, viewport_end, canvas_width);
            let x1 = x1.max(0.0).min(canvas_width);
            let x2 = x2.max(0.0).min(canvas_width);

            if (x2 - x1).abs() < 0.5 {
                continue;
            }

            let y1 = RULER_HEIGHT + (*row as f32) * ROW_HEIGHT + PADDING;
            let y2 = y1 + ROW_HEIGHT - 2.0 * PADDING;

            push_quad(&mut vertices, x1, y1, x2, y2, strand_color(feature.strand));
        }

        // Upload to GPU
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.vertex_buffer));
        unsafe {
            let vert_array = js_sys::Float32Array::view(&vertices);
            gl.buffer_data_with_array_buffer_view(
                GL::ARRAY_BUFFER,
                &vert_array,
                GL::DYNAMIC_DRAW,
            );
        }

        // stride = 5 floats * 4 bytes = 20 bytes
        let stride = 5 * 4;
        gl.vertex_attrib_pointer_with_i32(self.position_loc, 2, GL::FLOAT, false, stride, 0);
        gl.enable_vertex_attrib_array(self.position_loc);

        gl.vertex_attrib_pointer_with_i32(self.color_loc, 3, GL::FLOAT, false, stride, 2 * 4);
        gl.enable_vertex_attrib_array(self.color_loc);

        let vertex_count = (vertices.len() / 5) as i32;
        if vertex_count > 0 {
            gl.draw_arrays(GL::TRIANGLES, 0, vertex_count);
        }

        Ok(())
    }
}

// --- Private helpers ---

fn genomic_to_screen(pos: u32, vp_start: u32, vp_end: u32, canvas_width: f32) -> f32 {
    let span = (vp_end - vp_start) as f32;
    let offset = (pos as f32) - (vp_start as f32);
    (offset / span) * canvas_width
}

fn strand_color(strand: Strand) -> [f32; 3] {
    match strand {
        Strand::Plus    => [0.25, 0.75, 0.35], // green
        Strand::Minus   => [0.85, 0.30, 0.30], // red
        Strand::Unknown => [0.55, 0.55, 0.60], // grey
    }
}

fn push_quad(vertices: &mut Vec<f32>, x1: f32, y1: f32, x2: f32, y2: f32, color: [f32; 3]) {
    let [r, g, b] = color;
    let corners = [
        (x1, y1), (x2, y1), (x1, y2),
        (x2, y1), (x2, y2), (x1, y2),
    ];
    for (x, y) in corners {
        vertices.extend_from_slice(&[x, y, r, g, b]);
    }
}

fn pack_rows(features: &[Feature]) -> Vec<usize> {
    let mut row_ends: Vec<u32> = Vec::new();
    let mut assignments = vec![0usize; features.len()];

    for (i, feature) in features.iter().enumerate() {
        let row = row_ends.iter().position(|&end| end <= feature.start);
        match row {
            Some(r) => {
                row_ends[r] = feature.end;
                assignments[i] = r;
            }
            None => {
                assignments[i] = row_ends.len();
                row_ends.push(feature.end);
            }
        }
    }
    assignments
}

fn build_ruler_vertices(
    vertices: &mut Vec<f32>,
    viewport_start: u32,
    viewport_end: u32,
    canvas_width: f32,
) {
    const RULER_HEIGHT: f32 = 30.0;
    const TICK_WIDTH: f32 = 1.5;
    const BG_COLOR: [f32; 3] = [0.18, 0.18, 0.22];
    const TICK_COLOR: [f32; 3] = [0.70, 0.70, 0.75];

    // Background bar
    push_quad(vertices, 0.0, 0.0, canvas_width, RULER_HEIGHT, BG_COLOR);

    let span = (viewport_end - viewport_start) as f64;
    let raw_interval = span / 10.0;
    let magnitude = raw_interval.log10().floor() as i32;
    let base: f64 = 10f64.powi(magnitude);
    let interval = (if raw_interval / base >= 5.0 { base * 5.0 } else { base }) as u32;

    if interval == 0 {
        return;
    }

    let first_tick = ((viewport_start / interval) + 1) * interval;
    let mut tick = first_tick;

    while tick < viewport_end {
        let sx = genomic_to_screen(tick, viewport_start, viewport_end, canvas_width);
        push_quad(
            vertices,
            sx - TICK_WIDTH / 2.0, 4.0,
            sx + TICK_WIDTH / 2.0, RULER_HEIGHT - 4.0,
            TICK_COLOR,
        );
        tick = tick.saturating_add(interval);
    }
}

// --- Shader helpers ---

fn compile_shader(gl: &GL, shader_type: u32, source: &str) -> Result<web_sys::WebGlShader, String> {
    let shader = gl.create_shader(shader_type).ok_or("failed to create shader")?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);

    if gl
        .get_shader_parameter(&shader, GL::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(shader)
    } else {
        Err(gl.get_shader_info_log(&shader).unwrap_or_default())
    }
}

fn link_program(gl: &GL) -> Result<WebGlProgram, String> {
    let vert = compile_shader(gl, GL::VERTEX_SHADER, VERT_SHADER)?;
    let frag = compile_shader(gl, GL::FRAGMENT_SHADER, FRAG_SHADER)?;

    let program = gl.create_program().ok_or("failed to create program")?;
    gl.attach_shader(&program, &vert);
    gl.attach_shader(&program, &frag);
    gl.link_program(&program);

    if gl
        .get_program_parameter(&program, GL::LINK_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(program)
    } else {
        Err(gl.get_program_info_log(&program).unwrap_or_default())
    }
}