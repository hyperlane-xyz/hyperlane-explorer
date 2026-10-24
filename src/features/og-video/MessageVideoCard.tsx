import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '../../consts/appMetadata';
import type { MessageOGData } from '../messages/queries/serverFetch';

export interface VideoMessage extends Pick<
  MessageOGData,
  'msgId' | 'status' | 'timestamp' | 'deliveryLatency'
> {
  origin: { name: string; logo: string };
  destination: { name: string; logo: string };
  transfer: { amount: string; symbol: string } | null;
}

interface Props {
  message: VideoMessage;
  /** Seconds into a five-second replay of the recorded message. */
  time: number;
  logo: string;
  showPacket?: boolean;
}

/** Server-rendered keyframes; FFmpeg animates the packet between them. */
export function MessageVideoCard({ message, time, logo, showPacket = true }: Props) {
  const delivered = message.status === 'Delivered';
  const progress = Math.min(1, Math.max(0, (time - 0.6) / 2.4));
  const arrived = delivered && progress === 1;
  const packetX = delivered ? 350 + progress * 500 : 350 + ((time / 2.5) % 1) * 425;
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
        {message.status}
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
        <span
          style={{
            fontSize: message.transfer ? Math.min(70, 650 / message.transfer.amount.length) : 48,
            letterSpacing: -2,
          }}
        >
          {message.transfer?.amount ?? 'Interchain message'}
        </span>
        {message.transfer && (
          <span style={{ fontSize: 30, color: '#c6b1dd' }}>{message.transfer.symbol}</span>
        )}
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
      {showPacket && (
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
      )}
      <ChainNode
        x={254}
        name={message.origin.name}
        logo={message.origin.logo}
        label="FROM"
        color="#7995ff"
      />
      <ChainNode
        x={946}
        name={message.destination.name}
        logo={message.destination.logo}
        label="TO"
        color={destinationColor}
      />
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
        {arrived
          ? 'RECEIVED AT DESTINATION'
          : delivered
            ? 'MESSAGE REPLAY'
            : message.status === 'Pending'
              ? 'AWAITING DELIVERY'
              : 'STATUS UNAVAILABLE'}
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
            {delivered && message.deliveryLatency ? 'DELIVERY TIME' : 'DESTINATION'}
          </span>
          <span style={{ fontSize: 27 }}>
            {delivered
              ? (message.deliveryLatency ?? 'Delivered')
              : message.status === 'Pending'
                ? 'Awaiting delivery'
                : 'Unknown'}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            alignItems: 'flex-end',
            color: '#a98bbf',
            fontSize: 16,
          }}
        >
          <span>
            {message.msgId.slice(0, 10)}...{message.msgId.slice(-8)}
          </span>
          <span>
            {new Date(message.timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC
          </span>
        </div>
      </div>
    </div>
  );
}

function ChainNode({
  x,
  name,
  label,
  color,
  logo,
}: {
  x: number;
  name: string;
  label: string;
  color: string;
  logo: string;
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: '#f8f8ff',
          }}
        >
          <img src={logo} width={46} height={46} />
        </div>
      </div>
      <span style={{ fontSize: Math.min(25, 320 / name.length), marginTop: 17 }}>{name}</span>
    </div>
  );
}
