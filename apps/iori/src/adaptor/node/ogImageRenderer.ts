import satori from 'satori';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;

export const renderNodeOgImage = async (
  { title, fontData }: { title: string; fontData: ArrayBuffer },
): Promise<Buffer> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #F8F6F1 0%, #F0EEE9 100%)',
        position: 'relative',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: -50,
              right: -50,
              width: 400,
              height: 360,
              borderRadius: '50%',
              background: '#D49A82',
              opacity: 0.15,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: -30,
              left: -50,
              width: 300,
              height: 280,
              borderRadius: '50%',
              background: '#D4C4A8',
              opacity: 0.2,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: 100,
              right: 100,
              width: 200,
              height: 180,
              borderRadius: '50%',
              background: '#8FA88B',
              opacity: 0.12,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 80px',
              textAlign: 'center',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  fontSize: 56,
                  fontWeight: 700,
                  color: '#5A5450',
                  lineHeight: 1.3,
                  maxWidth: 1000,
                  wordBreak: 'break-word',
                },
                children: title,
              },
            },
          },
        },
        {
          type: 'div',
          props: {
            style: { position: 'absolute', bottom: 50, fontSize: 24, color: '#7A746E' },
            children: 'blog.kosui.me',
          },
        },
      ],
    },
  };
  const svg = await satori(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: 'Noto Sans JP', data: fontData, weight: 700, style: 'normal' }],
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
};
