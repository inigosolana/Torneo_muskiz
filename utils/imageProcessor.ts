/**
 * utils/imageProcessor.ts
 * Utilidad para redimensionar y comprimir imágenes (WebP/JPEG) en el cliente usando HTML5 Canvas.
 */

export const resizeAndCompressImage = (
    file: File,
    maxWidth: number = 1200,
    format: 'image/webp' | 'image/jpeg' = 'image/webp',
    quality: number = 0.8
): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.src = e.target?.result as string;
        };

        reader.onerror = (error) => {
            reject(error);
        };

        img.onload = () => {
            const canvas = document.createElement('canvas');

            // Calculamos nuevas dimensiones
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('No se pudo obtener el contexto 2d del canvas'));
                return;
            }

            // Dibujamos la imagen redimensionada en el canvas
            ctx.drawImage(img, 0, 0, width, height);

            // Exportamos el contenido del canvas a un Blob
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Fallo al convertir el Canvas a Blob'));
                }
            }, format, quality);
        };

        img.onerror = () => {
            reject(new Error('Fallo al cargar la imagen para procesar'));
        };

        reader.readAsDataURL(file); // Comenzamos la lectura del archivo
    });
};
