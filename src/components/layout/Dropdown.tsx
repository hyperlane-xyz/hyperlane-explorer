import { Menu, Popover, Transition } from '@headlessui/react';
import { Fragment, PropsWithChildren, ReactElement, ReactNode } from 'react';

interface MenuProps {
  ButtonContent: (p: { isOpen: boolean }) => ReactElement;
  buttonClasses?: string;
  buttonTitle?: string;
  menuItems: Array<(close: () => void) => ReactElement>;
  menuClasses?: string;
  isFullscreen?: boolean;
}

// Uses Headless menu, which auto-closes on any item click
export function DropdownMenu({
  ButtonContent,
  buttonClasses,
  buttonTitle,
  menuItems,
  menuClasses,
  isFullscreen,
}: MenuProps) {
  const menuItemsClass = isFullscreen
    ? `z-50 fixed left-0 right-0 top-20 bottom-0 w-screen bg-blue-500 focus:outline-none ${menuClasses}`
    : `z-50 absolute -right-1.5 mt-3 origin-top-right rounded-md bg-white shadow-md drop-shadow-md focus:outline-none ${menuClasses}`;

  return (
    <Menu as="div" className="relative">
      <Menu.Button title={buttonTitle} className={`flex ${buttonClasses}`}>
        {({ open }) => <ButtonContent isOpen={open} />}
      </Menu.Button>
      <DropdownTransition>
        <Menu.Items className={menuItemsClass}>
          {menuItems.map((mi, i) => (
            <Menu.Item key={`menu-item-${i}`}>{({ close }) => mi(close)}</Menu.Item>
          ))}
        </Menu.Items>
      </DropdownTransition>
    </Menu>
  );
}

interface ModalProps {
  buttonContent: ReactNode;
  buttonClasses?: string;
  buttonTitle?: string;
  modalContent: (close: () => void) => ReactElement;
  modalClasses?: string;
}

// Uses Headless Popover, which is a more general purpose dropdown box
export function DropdownModal({
  buttonContent,
  buttonClasses,
  buttonTitle,
  modalContent,
  modalClasses,
}: ModalProps) {
  return (
    <Popover className="relative">
      <Popover.Button title={buttonTitle} className={`flex ${buttonClasses}`}>
        {buttonContent}
      </Popover.Button>
      <DropdownTransition>
        <Popover.Panel
          className={`z-50 absolute mt-3 origin-top-right rounded-md bg-white shadow-md drop-shadow-md focus:outline-none ${modalClasses}`}
        >
          {({ close }) => modalContent(close)}
        </Popover.Panel>
      </DropdownTransition>
    </Popover>
  );
}

function DropdownTransition({ children }: PropsWithChildren<unknown>) {
  return (
    <Transition
      as={Fragment}
      enter="transition ease-out duration-200"
      enterFrom="transform opacity-0 scale-95"
      enterTo="transform opacity-100 scale-100"
      leave="transition ease-in duration-100"
      leaveFrom="transform opacity-100 scale-100"
      leaveTo="transform opacity-0 scale-95"
    >
      {children}
    </Transition>
  );
}
