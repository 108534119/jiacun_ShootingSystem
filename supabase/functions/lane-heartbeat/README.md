# 靶機在線心跳

1. 在 Supabase 部署 `lane-heartbeat` Edge Function，並將 **Verify JWT** 關閉；ESP32 沒有登入 JWT，函式會改用裝置專屬的 `x-device-key` 驗證。
2. 在 Edge Function Secrets 新增 `LANE_DEVICE_KEYS_JSON`：

```json
{"esp32-01":"第一台隨機長金鑰","esp32-02":"第二台隨機長金鑰"}
```

3. `lanes.address` 必須使用相同裝置識別，例如 `esp32-01`。
4. ESP32 每秒 POST 至：

```text
https://pwrsokknkdkwifnmmjbp.supabase.co/functions/v1/lane-heartbeat
```

Header：`x-device-key`；Body：`{"device_id":"esp32-01"}`。

超過 3 秒未收到心跳，網站會顯示「離線」；進行中的場次最多占用 20 分鐘，每次成功記錄射擊會自動續期。
