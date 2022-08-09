import { TextField } from '../../components/input/TextField';
import { HrDivider } from '../../components/layout/HrDivider';

export function SearchForm() {
  // TODO consider using multiprovider here?
  return (
    <>
      <div className="flex flex-col justify-center items-center w-full">
        <h2 className="text-gray-700">TODO</h2>
        <div className="px-1 w-full">
          <HrDivider classes="my-5" />
        </div>
        <TextField name="contract" placeholder="Contract Address 0x123..." />
      </div>
    </>
  );
}
