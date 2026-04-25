"use client";

import { useRef, useEffect, useCallback } from "react";
import { useReducedMotion } from "framer-motion";

interface GradientShaderProps {
  className?: string;
  interactive?: boolean;
  opacity?: number;
  speed?: number;
}

const VERTEX_SOURCE = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SOURCE = `
precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec3 u_colors[7];
uniform float u_speed;
uniform float u_frozen;

float blob(vec2 uv, vec2 center, float radius) {
  float d = length(uv - center);
  return exp(-d * d / (2.0 * radius * radius));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uvA = vec2(uv.x * aspect, uv.y);

  float t = u_time * u_speed * (1.0 - u_frozen);

  // 6 blob centers drifting with sine/cosine
  vec2 c0 = vec2(0.3 + 0.15 * sin(t * 0.3), 0.7 + 0.10 * cos(t * 0.4 + 1.0));
  vec2 c1 = vec2(0.7 + 0.12 * cos(t * 0.25 + 2.0), 0.3 + 0.15 * sin(t * 0.35 + 3.0));
  vec2 c2 = vec2(0.5 + 0.20 * sin(t * 0.2 + 4.0), 0.5 + 0.18 * cos(t * 0.3 + 5.0));
  vec2 c3 = vec2(0.2 + 0.10 * cos(t * 0.35 + 6.0), 0.4 + 0.12 * sin(t * 0.25 + 7.0));
  vec2 c4 = vec2(0.8 + 0.08 * sin(t * 0.4 + 8.0), 0.6 + 0.14 * cos(t * 0.2 + 9.0));
  vec2 c5 = vec2(0.5 + 0.16 * cos(t * 0.15 + 10.0), 0.8 + 0.10 * sin(t * 0.3 + 11.0));

  vec2 centers[6];
  centers[0] = c0; centers[1] = c1; centers[2] = c2;
  centers[3] = c3; centers[4] = c4; centers[5] = c5;

  float radii[6];
  radii[0] = 0.35; radii[1] = 0.30; radii[2] = 0.40;
  radii[3] = 0.25; radii[4] = 0.28; radii[5] = 0.32;

  vec3 color = u_colors[6];
  float mouseRadius = 0.25;

  for (int i = 0; i < 6; i++) {
    vec2 center = centers[i];

    // Pull blob toward cursor
    float md = length(center - u_mouse);
    float mw = exp(-md * md / (2.0 * mouseRadius * mouseRadius));
    center = mix(center, u_mouse, mw * 0.15);

    vec2 cA = vec2(center.x * aspect, center.y);
    float w = blob(uvA, cA, radii[i]);
    color += u_colors[i] * w * 0.8;
  }

  // Subtle cursor glow
  float cd = length(uvA - vec2(u_mouse.x * aspect, u_mouse.y));
  float glow = exp(-cd * cd / (2.0 * 0.15 * 0.15)) * 0.12;
  color += u_colors[4] * glow;

  // Vignette
  color *= 1.0 - 0.3 * length(uv - 0.5);

  gl_FragColor = vec4(color, 1.0);
}`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function hexToNormalized(hex: string): [number, number, number] {
  const c = hex.replace(/^#/, "");
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

function readShaderColors(): Array<[number, number, number]> {
  const style = getComputedStyle(document.documentElement);
  const vars = [
    "--color-shader-blob-1",
    "--color-shader-blob-2",
    "--color-shader-blob-3",
    "--color-shader-blob-4",
    "--color-shader-blob-5",
    "--color-shader-blob-6",
    "--color-shader-bg",
  ];
  return vars.map((v) => {
    const val = style.getPropertyValue(v).trim();
    return val
      ? hexToNormalized(val)
      : ([0.02, 0.05, 0.08] as [number, number, number]);
  });
}

export function GradientShader({
  className,
  interactive = true,
  opacity = 1,
  speed = 1,
}: GradientShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef(0);
  const shouldReduceMotion = useReducedMotion();

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!interactive) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1.0 - (e.clientY - rect.top) / rect.height,
      };
    },
    [interactive],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!interactive) return;
      const touch = e.touches[0];
      const canvas = canvasRef.current;
      if (!touch || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (touch.clientX - rect.left) / rect.width,
        y: 1.0 - (touch.clientY - rect.top) / rect.height,
      };
    },
    [interactive],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    if (!vert || !frag) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Shader link error:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uTime = gl.getUniformLocation(program, "u_time");
    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uSpeed = gl.getUniformLocation(program, "u_speed");
    const uFrozen = gl.getUniformLocation(program, "u_frozen");

    const colorLocs = Array.from({ length: 7 }, (_, i) =>
      gl.getUniformLocation(program, `u_colors[${String(i)}]`),
    );

    // Set static uniforms
    gl.uniform1f(uSpeed, speed);
    gl.uniform1f(uFrozen, shouldReduceMotion ? 1.0 : 0.0);

    const colors = readShaderColors();
    for (let i = 0; i < 7; i++) {
      const c = colors[i];
      const loc = colorLocs[i];
      if (c && loc) gl.uniform3f(loc, c[0], c[1], c[2]);
    }

    // Resize handling
    const dpr = Math.min(window.devicePixelRatio, 2);
    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Render loop — capture gl in a const so TypeScript knows it is non-null
    const glCtx = gl;
    const t0 = performance.now();
    function render() {
      const elapsed = (performance.now() - t0) / 1000;
      glCtx.uniform1f(uTime, elapsed);
      glCtx.uniform2f(uRes, canvas!.width, canvas!.height);
      glCtx.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y);
      glCtx.viewport(0, 0, canvas!.width, canvas!.height);
      glCtx.drawArrays(glCtx.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    }
    rafRef.current = requestAnimationFrame(render);

    // Mouse events
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove as EventListener);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener(
        "touchmove",
        handleTouchMove as EventListener,
      );
      observer.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteBuffer(buf);
    };
  }, [speed, shouldReduceMotion, handleMouseMove, handleTouchMove]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}
