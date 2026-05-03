import { loadConfig } from '../config/index';

export async function sendFatal(message: string): Promise<void> {
  const config = loadConfig();
  const promises: Promise<any>[] = [];

  // NTFY
  if (config.ntfyUrl) {
    promises.push(
      fetch(config.ntfyUrl, {
        method: 'POST',
        headers: {
          'Title': 'XIA FATAL ERROR',
          'Priority': 'urgent',
          'Tags': 'warning,skull'
        },
        body: message
      }).catch(err => console.error('Failed to send NTFY alert:', err))
    );
  }

  // Pushover
  if (config.pushoverToken) {
    const [token, user] = config.pushoverToken.split(':');
    if (token && user) {
      const formData = new URLSearchParams();
      formData.append('token', token);
      formData.append('user', user);
      formData.append('message', message);
      formData.append('priority', '2'); // Emergency priority
      formData.append('retry', '30');
      formData.append('expire', '3600');
      formData.append('title', 'XIA FATAL ERROR');

      promises.push(
        fetch('https://api.pushover.net/1/messages.json', {
          method: 'POST',
          body: formData
        }).catch(err => console.error('Failed to send Pushover alert:', err))
      );
    }
  }

  await Promise.all(promises);
}
