self.addEventListener('install', (event) => {
  self.skipWaiting();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
    });

    self.addEventListener('push', (event) => {
      let data = { title: 'Lia', body: 'Tienes una notificación nueva.' };
        try {
            if (event.data) data = event.data.json();
              } catch (e) {
                  if (event.data) data.body = event.data.text();
                    }

                      const options = {
                          body: data.body,
                              icon: undefined,
                                  badge: undefined,
                                      data: { url: data.url || './' }
                                        };

                                          event.waitUntil(self.registration.showNotification(data.title || 'Lia', options));
                                          });

                                          self.addEventListener('notificationclick', (event) => {
                                            event.notification.close();
                                              const targetUrl = (event.notification.data && event.notification.data.url) || './';
                                                event.waitUntil(
                                                    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                                                          for (const client of clientList) {
                                                                  if ('focus' in client) return client.focus();
                                                                        }
                                                                              if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
                                                                                  })
                                                                                    );
                                                                                    });
                                                                                    
