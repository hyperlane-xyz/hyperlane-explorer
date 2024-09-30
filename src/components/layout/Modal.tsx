import { Dialog, Transition } from '@headlessui/react';
import { Fragment, PropsWithChildren } from 'react';

import XCircle from '../../images/icons/x-circle.svg';
import { IconButton } from '../buttons/IconButton';

export function Modal({
  isOpen,
  title,
  close,
  maxWidth,
  children,
}: PropsWithChildren<{ isOpen: boolean; title?: string; close: () => void; maxWidth?: string }>) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-30" onClose={close}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={`w-full ${
                  maxWidth || 'max-w-xs'
                } max-h-[90vh] transform overflow-auto rounded-xl bg-white px-4 py-4 text-left shadow-lg transition-all`}
              >
                {!!title && (
                  <Dialog.Title as="h3" className="font-medium text-blue-500">
                    {title}
                  </Dialog.Title>
                )}
                {children}
                <div className="absolute right-3 top-3">
                  <IconButton
                    imgSrc={XCircle}
                    onClick={close}
                    title="Close"
                    classes="hover:rotate-90"
                  />
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
