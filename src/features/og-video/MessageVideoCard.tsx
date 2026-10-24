import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '../../consts/appMetadata';

export type VideoPreviewStatus = 'delivered' | 'pending';

interface Props {
  status: VideoPreviewStatus;
  /** Seconds into a five-second illustrative replay. */
  time: number;
  logo: string;
}

/** Deterministic frames for the build-time renderer; no RPCs or browser animation. */
export function MessageVideoCard({ status, time, logo }: Props) {
  const delivered = status === 'delivered';
  const progress = Math.min(1, Math.max(0, (time - 0.6) / 2.4));
  const arrived = delivered && progress === 1;
  const packetX = delivered ? 350 + progress * 500 : 350 + ((time * 0.28) % 1) * 425;
  const destinationColor = arrived ? '#53e6ad' : '#c38bff';

  return (
    <div
      style={{
        display: 'flex',
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at 75% 100%, #351153 0%, #140a22 55%, #0d0816 100%)',
        color: '#f8f8ff',
        fontFamily: 'mono',
      }}
    >
      {Array.from({ length: 14 }, (_, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: index * 100 - 50,
            top: 0,
            width: 1,
            height: OG_IMAGE_HEIGHT,
            background: '#c38bff',
            opacity: 0.045,
          }}
        />
      ))}
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: 0,
            top: index * 90,
            width: OG_IMAGE_WIDTH,
            height: 1,
            background: '#c38bff',
            opacity: 0.045,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: OG_IMAGE_WIDTH,
          height: 3,
          background: 'linear-gradient(90deg, #634cff, #d28dff, #ff7ee8)',
        }}
      />
      <img src={logo} width={245} height={60} style={{ position: 'absolute', left: 54, top: 38 }} />
      <div
        style={{
          position: 'absolute',
          right: 54,
          top: 53,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 20,
          color: delivered ? '#53e6ad' : '#f7c66b',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: delivered ? '#53e6ad' : '#f7c66b',
          }}
        />
        {delivered ? 'Delivered' : 'Pending'}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 133,
          left: 0,
          width: OG_IMAGE_WIDTH,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'baseline',
          gap: 18,
        }}
      >
        <span style={{ fontSize: 70, letterSpacing: -3 }}>1,250.00</span>
        <span style={{ fontSize: 30, color: '#c6b1dd' }}>USDC</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 350,
          top: 328,
          width: 500,
          height: 2,
          background: '#4e3267',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 350,
          top: 328,
          width: delivered ? progress * 500 : 0,
          height: 2,
          background: 'linear-gradient(90deg, #567bff, #d093ff)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 320,
          left: packetX - 8,
          display: 'flex',
          width: 18,
          height: 18,
          borderRadius: 4,
          background: arrived ? '#53e6ad' : '#e1bbff',
          boxShadow: `0 0 26px ${arrived ? '#53e6ad' : '#b26bff'}`,
          transform: 'rotate(45deg)',
          opacity: arrived ? 0 : 1,
        }}
      />
      <ChainNode x={254} name="Base" label="FROM" color="#7995ff" ethereum={false} />
      <ChainNode x={946} name="Ethereum" label="TO" color={destinationColor} ethereum />
      <div
        style={{
          position: 'absolute',
          top: 384,
          left: 350,
          width: 500,
          display: 'flex',
          justifyContent: 'center',
          fontSize: 17,
          letterSpacing: 2,
          color: arrived ? '#53e6ad' : '#b391cf',
        }}
      >
        {arrived ? 'RECEIVED ON ETHEREUM' : delivered ? 'MESSAGE REPLAY' : 'AWAITING DELIVERY'}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          bottom: 50,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderTop: '1px solid #412554',
          paddingTop: 24,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span style={{ fontSize: 15, letterSpacing: 2, color: '#a98bbf' }}>
            {delivered ? 'DELIVERY TIME' : 'DESTINATION'}
          </span>
          <span style={{ fontSize: 27 }}>
            {delivered ? '24 seconds' : 'Waiting for confirmation'}
          </span>
        </div>
        <span style={{ fontSize: 16, color: '#a98bbf' }}>ILLUSTRATIVE TRANSFER</span>
      </div>
    </div>
  );
}

function ChainNode({
  x,
  name,
  label,
  color,
  ethereum,
}: {
  x: number;
  name: string;
  label: string;
  color: string;
  ethereum: boolean;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 90,
        top: 254,
        width: 180,
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      <span style={{ color: '#a98bbf', fontSize: 15, letterSpacing: 3, marginBottom: 18 }}>
        {label}
      </span>
      <div
        style={{
          width: 86,
          height: 86,
          border: `1px solid ${color}`,
          borderRadius: '50%',
          background: '#1e1230',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 40px ${color}25`,
        }}
      >
        {ethereum ? (
          <svg width="32" height="50" viewBox="0 0 32 50">
            <path d="M16 0 0 26 16 35 32 26Z M0 29 16 50 32 29 16 38Z" fill={color} />
            <path d="M16 0 16 35 32 26Z M16 38 16 50 32 29Z" fill="#ffffff" opacity="0.3" />
          </svg>
        ) : (
          <svg width="46" height="46" viewBox="0 0 46 46">
            <circle cx="23" cy="23" r="23" fill="#2055ff" />
            <path d="M3 23H27" stroke="white" strokeWidth="4" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: 25, marginTop: 17 }}>{name}</span>
    </div>
  );
}
