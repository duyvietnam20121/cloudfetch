# CloudFetch Worker

Bản mẫu website dán URL và chuyển tiếp tải tệp bằng Cloudflare Worker. Giao diện `public/index.html` và API `/download` chạy cùng một Worker.

## Đưa lên GitHub

1. Giải nén ZIP này.
2. Tạo repository GitHub mới, ví dụ `cloudfetch-worker`.
3. Đưa **các tệp bên trong** thư mục `cloudfetch-worker` lên thư mục gốc repo. Ở cấp gốc phải thấy `wrangler.jsonc`, `src/`, `public/`.
4. Trong Cloudflare Dashboard, vào **Workers & Pages** và chọn tạo Worker từ repository GitHub/Connect to Git (tên mục có thể khác đôi chút theo giao diện tài khoản).
5. Chọn repo vừa tạo và giữ cấu hình trong `wrangler.jsonc`. Dự án không cần bước build riêng; dùng Wrangler để deploy nếu dashboard yêu cầu lệnh deploy.
6. Mở URL `*.workers.dev` được Cloudflare cấp để kiểm tra.

## Cách khác: deploy từ máy tính

Cần Node.js. Mở terminal tại thư mục dự án rồi chạy:

```bash
npx wrangler login
npx wrangler deploy
```

## Cách hoạt động

- `/` được phục vụ từ `public/index.html`.
- `/download?url=...` chuyển tiếp dữ liệu từ URL nguồn và trả về dạng tệp tải xuống.
- Chuyển tiếp header Range cơ bản.
- Giới hạn 200 MiB cho mỗi tệp và giới hạn số lần chuyển hướng.

## Lưu ý

- Đây là mẫu học tập, không đảm bảo tăng tốc. Worker chuyển tiếp dữ liệu; tốc độ tùy thuộc máy chủ nguồn, vị trí mạng và giới hạn nền tảng.
- Link cần đăng nhập, cookie, token hoặc trang xem trước có thể không dùng được.
- Mẫu chặn IP literal và một số hostname nội bộ, nhưng không nên coi đây là lớp bảo vệ hoàn chỉnh cho proxy công khai. Không chia sẻ công khai lâu dài nếu chưa bổ sung xác thực/giới hạn yêu cầu và giám sát.
- Chỉ tải nội dung bạn được phép truy cập; không dùng để vượt quyền truy cập hoặc giới hạn của máy chủ nguồn.
