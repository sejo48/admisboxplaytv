/* Browser-only signal probes. Never use opaque fetch responses as proof of life. */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.BoxStreamHealth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    function check(url, { signal, timeoutMs = 12000, HlsClass = globalThis.Hls } = {}) {
        return new Promise(resolve => {
            let video, hls, timer, settled = false;
            const finish = (status, detail) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener('abort', cancel);
                if (video) { video.onloadeddata = null; video.oncanplay = null; video.onerror = null; }
                hls?.destroy();
                if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
                resolve({ status, detail, checkedAt: Date.now() });
            };
            const cancel = () => finish('unknown', 'Revisión cancelada.');
            if (signal?.aborted) return cancel();
            let address;
            try { address = new URL(String(url || '').trim()); } catch { return finish('offline', 'Falta una URL de señal válida.'); }
            if (!['https:', 'http:'].includes(address.protocol)) return finish('unknown', 'Este protocolo necesita un reproductor externo.');
            if (globalThis.location?.protocol === 'https:' && address.protocol === 'http:') return finish('unknown', 'El navegador bloquea señales HTTP desde esta página HTTPS. Usa Probar en un reproductor compatible.');
            if (/\.mpd(?:$|\?)/i.test(address.href)) return finish('unknown', 'La revisión automática no admite MPEG-DASH. Comprueba esta señal en un reproductor compatible.');
            signal?.addEventListener('abort', cancel, { once: true });
            timer = setTimeout(() => finish('unknown', 'Sin confirmación en 12 segundos: puede ser una demora, CORS o una restricción de acceso.'), timeoutMs);
            try {
                video = document.createElement('video');
                video.muted = true; video.preload = 'auto'; video.playsInline = true;
                video.onloadeddata = video.oncanplay = () => finish('online', 'Se recibieron datos de video reproducibles.');
                video.onerror = () => finish('unknown', 'El navegador no pudo reproducir la señal: revisa acceso, formato o conexión.');
                const hlsSupported = HlsClass?.isSupported();
                const native = /\.(?:mp4|webm|ogg)(?:$|\?)/i.test(address.href) || (!hlsSupported && video.canPlayType('application/vnd.apple.mpegurl')); 
                if (native) { video.src = address.href; video.load(); }
                else if (hlsSupported) {
                    hls = new HlsClass({ enableWorker: false, maxBufferLength: 2, maxMaxBufferLength: 4, maxBufferSize: 2000000, manifestLoadingMaxRetry: 0, levelLoadingMaxRetry: 0, fragLoadingMaxRetry: 0 });
                    hls.on(HlsClass.Events.ERROR, (_, data) => {
                        if (!data.fatal) return;
                        const code = Number(data.response?.code || data.response?.status || data.networkDetails?.status || 0);
                        if (code === 401 || code === 403) finish('unknown', 'Acceso restringido por el servidor (HTTP ' + code + ').');
                        else if (code >= 400) finish('offline', 'La señal devolvió un error HTTP ' + code + '.');
                        else finish('unknown', 'No se pudo confirmar la señal: posible bloqueo CORS, formato incompatible o fallo de conexión.');
                    });
                    hls.loadSource(address.href); hls.attachMedia(video);
                } else finish('unknown', 'Este navegador no admite la comprobación de esta señal.');
            } catch { finish('unknown', 'No se pudo iniciar la comprobación en este navegador.'); }
        });
    }
    return { check };
});
