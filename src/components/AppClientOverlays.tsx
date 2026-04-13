import { ToastContainer, Zoom } from 'react-toastify';
import { Tooltip } from 'react-tooltip';

export function AppClientOverlays() {
  return (
    <>
      <ToastContainer transition={Zoom} position="bottom-right" limit={2} />
      <Tooltip id="root-tooltip" className="z-50" />
    </>
  );
}
