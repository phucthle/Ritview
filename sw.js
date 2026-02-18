const CACHE_NAME = "my-app-cache-v1";

const urlsToCache = [
  "/",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "courses.js" // [ADD] Cache luôn file danh sách bài học
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("Caching files...");
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const requestUrl = new URL(event.request.url);

  // [LOGIC MỚI] Xử lý đặc biệt cho file courses.js
  // Để tự động quét và cache các file data bên trong nó
  if (requestUrl.pathname.endsWith("courses.js")) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // 1. Tải thành công từ mạng
          // Clone response để vừa trả về cho web, vừa đọc để xử lý
          const responseClone = networkResponse.clone();
          
          // 2. Đọc nội dung file courses.js để tìm các file data
          responseClone.text().then(content => {
            // Regex tìm chuỗi: file: 'ten_file.js' hoặc file: "ten_file.js"
            const regex = /file\s*:\s*['"]([^'"]+)['"]/g;
            let match;
            const dataFilesToCache = [];

            while ((match = regex.exec(content)) !== null) {
              // match[1] là tên file (ví dụ: volca.js)
              // Thêm tiền tố 'data/' vì file nằm trong thư mục data
              dataFilesToCache.push('data/' + match[1]);
            }

            if (dataFilesToCache.length > 0) {
              console.log("Đã tìm thấy và đang cache tự động các file:", dataFilesToCache);
              caches.open(CACHE_NAME).then(cache => {
                cache.addAll(dataFilesToCache);
              });
            }
          });

          // 3. Lưu bản courses.js mới nhất vào cache
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // Nếu mất mạng, lấy courses.js từ cache cũ
          return caches.match(event.request);
        })
    );
    return; // Kết thúc xử lý cho courses.js
  }

  // [LOGIC CŨ] Các file khác xử lý như bình thường (Cache First)
  event.respondWith(
    caches.match(event.request).then(response => {
      // Nếu có trong cache thì trả về
      if (response) {
        return response;
      }
      // Nếu không có thì tải từ mạng và lưu vào cache (Dynamic Caching)
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});