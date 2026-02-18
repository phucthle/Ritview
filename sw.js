const CACHE_NAME = "my-app-cache-v2";

const urlsToCache = [
  "/",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "courses.js" 
];

// [EDIT] Viết lại sự kiện install để chủ động quét file data ngay từ đầu
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
        console.log("[INSTALL] Bắt đầu quá trình caching...");
        
        // Tạo danh sách file cần cache (bắt đầu bằng danh sách tĩnh)
        let finalUrlsToCache = [...urlsToCache];

        try {
            // 1. Chủ động tải courses.js để đọc nội dung
            const response = await fetch('courses.js');
            if (response.ok) {
                const content = await response.text();
                
                // [FIX REGEX] Thêm ['"]? vào trước và sau chữ file để bắt được cả "file": và file:
                // Regex cũ: /file\s*:\s*['"]([^'"]+)['"]/g
                const regex = /['"]?file['"]?\s*:\s*['"]([^'"]+)['"]/g;
                let match;
                
                // 2. Quét nội dung để tìm file data
                while ((match = regex.exec(content)) !== null) {
                    const dataFile = 'data/' + match[1];
                    finalUrlsToCache.push(dataFile);
                }
                console.log("[INSTALL] Đã tự động tìm thấy các file data:", finalUrlsToCache);
            }
        } catch (err) {
            console.error("[INSTALL] Lỗi khi phân tích courses.js, sẽ chỉ cache file tĩnh.", err);
        }

        // 3. Thực hiện cache toàn bộ danh sách (tĩnh + data tìm được)
        return cache.addAll(finalUrlsToCache);
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

  // [LOGIC MỚI] Giữ nguyên logic này để cập nhật cache khi file courses.js thay đổi sau này
  if (requestUrl.pathname.endsWith("courses.js")) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // 1. Tải thành công từ mạng
          const responseClone = networkResponse.clone();
          
          // 2. Đọc nội dung file courses.js
          responseClone.text().then(content => {
            // [FIX REGEX] Cập nhật regex giống phần install để đồng bộ
            const regex = /['"]?file['"]?\s*:\s*['"]([^'"]+)['"]/g;
            let match;
            const dataFilesToCache = [];

            while ((match = regex.exec(content)) !== null) {
              dataFilesToCache.push('data/' + match[1]);
            }

            if (dataFilesToCache.length > 0) {
              console.log("[FETCH] Đang cập nhật cache các file data:", dataFilesToCache);
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
    return; 
  }

  // [LOGIC CŨ] Các file khác xử lý như bình thường (Cache First)
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
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