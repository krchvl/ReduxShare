#include "raylib_win/include/raylib.h"
#include <cmath>
#include <vector>

Color HsvToColor(float h, float s, float v, unsigned char alpha) {
    float c = v * s;
    float x = c * (1.0f - std::fabs(std::fmod(h / 60.0f, 2.0f) - 1.0f));
    float m = v - c;
    float r, g, b;
    if (h < 60.0f) { r = c; g = x; b = 0.0f; }
    else if (h < 120.0f) { r = x; g = c; b = 0.0f; }
    else if (h < 180.0f) { r = 0.0f; g = c; b = x; }
    else if (h < 240.0f) { r = 0.0f; g = x; b = c; }
    else if (h < 300.0f) { r = x; g = 0.0f; b = c; }
    else { r = c; g = 0.0f; b = x; }
    return Color{
        (unsigned char)((r + m) * 255.0f),
        (unsigned char)((g + m) * 255.0f),
        (unsigned char)((b + m) * 255.0f),
        alpha
    };
}

int main() {
    const int screenWidth = 800;
    const int screenHeight = 600;
    SetConfigFlags(FLAG_WINDOW_RESIZABLE);
    InitWindow(screenWidth, screenHeight, "Psychedelic Logo Show");
    SetTargetFPS(60);

    Texture2D tex1 = LoadTexture("./.github/images/reduxshare-logo-transparent.png");
    Texture2D tex2 = LoadTexture("./.github/images/reduxshare-logo.png");
    if (tex1.id == 0 || tex2.id == 0) {
        CloseWindow();
        return 1;
    }

    RenderTexture2D rt = LoadRenderTexture(screenWidth, screenHeight);

    const char* vs = R"(#version 330
in vec3 vertexPosition;
in vec2 vertexTexCoord;
out vec2 fragTexCoord;
uniform mat4 mvp;
void main() {
    gl_Position = mvp * vec4(vertexPosition, 1.0);
    fragTexCoord = vertexTexCoord;
}
)";

    const char* fs = R"(#version 330
in vec2 fragTexCoord;
out vec4 finalColor;
uniform sampler2D texture0;
uniform float time;
void main() {
    vec2 uv = fragTexCoord;
    uv.x += sin(uv.y * 10.0 + time * 2.0) * 0.05;
    uv.y += cos(uv.x * 10.0 + time * 2.0) * 0.05;
    vec4 texColor = texture(texture0, uv);
    float r = texColor.r * (0.5 + 0.5 * sin(time * 3.0));
    float g = texColor.g * (0.5 + 0.5 * sin(time * 3.0 + 2.0));
    float b = texColor.b * (0.5 + 0.5 * sin(time * 3.0 + 4.0));
    finalColor = vec4(r, g, b, texColor.a);
}
)";

    Shader shader = LoadShaderFromMemory(vs, fs);
    int timeLoc = GetShaderLocation(shader, "time");

    while (!WindowShouldClose()) {
        float t = GetTime();

        if (IsWindowResized()) {
            int newW = GetScreenWidth();
            int newH = GetScreenHeight();
            UnloadRenderTexture(rt);
            rt = LoadRenderTexture(newW, newH);
        }

        BeginTextureMode(rt);
        ClearBackground(BLACK);

        int count = 30;
        float centerX = (float)rt.texture.width * 0.5f;
        float centerY = (float)rt.texture.height * 0.5f;

        for (int i = 0; i < count; i++) {
            float phase = (float)i * 0.7f;
            float radiusX = rt.texture.width * 0.35f + rt.texture.width * 0.12f * sinf(t * 1.3f + phase);
            float radiusY = rt.texture.height * 0.35f + rt.texture.height * 0.12f * cosf(t * 1.1f + phase);
            float posX = centerX + radiusX * sinf(t * 0.8f + phase * 1.7f);
            float posY = centerY + radiusY * cosf(t * 0.6f + phase * 1.9f);

            float scale = 0.6f + 0.4f * sinf(t * 2.0f + phase);
            float rotation = t * 30.0f + phase * 15.0f;

            float hue = std::fmod(t * 40.0f + i * 12.0f, 360.0f);
            Color tint = HsvToColor(hue, 0.9f, 1.0f, 200);
            Texture2D tex = (i % 2 == 0) ? tex1 : tex2;

            Rectangle src = { 0.0f, 0.0f, (float)tex.width, (float)tex.height };
            Rectangle dst = {
                posX - tex.width * scale * 0.5f,
                posY - tex.height * scale * 0.5f,
                tex.width * scale,
                tex.height * scale
            };
            Vector2 origin = { tex.width * scale * 0.5f, tex.height * scale * 0.5f };

            DrawTexturePro(tex, src, dst, origin, rotation, tint);
        }

        EndTextureMode();

        SetShaderValue(shader, timeLoc, &t, SHADER_UNIFORM_FLOAT);
        BeginShaderMode(shader);
        DrawTextureRec(rt.texture,
                       { 0.0f, 0.0f, (float)rt.texture.width, -(float)rt.texture.height },
                       { 0.0f, 0.0f },
                       WHITE);
        EndShaderMode();

        BeginDrawing();
        EndDrawing();
    }

    UnloadShader(shader);
    UnloadRenderTexture(rt);
    UnloadTexture(tex1);
    UnloadTexture(tex2);
    CloseWindow();

    return 0;
}
