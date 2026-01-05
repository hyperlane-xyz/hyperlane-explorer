import { Field, Form, Formik } from 'formik';
import { useRouter } from 'next/router';

import { IconButton, SearchIcon } from '@hyperlane-xyz/widgets';

import { Color } from '../../styles/Color';

interface FormValues {
  search: string;
}

const initialValues: FormValues = {
  search: '',
};

export function MiniSearchBar() {
  const router = useRouter();
  const onSubmit = async ({ search }: FormValues) => {
    if (!search) return;
    await router.push(`/?search=${search}`);
  };

  return (
    <Formik<FormValues> initialValues={initialValues} onSubmit={onSubmit}>
      <Form>
        <div className="flex items-center rounded-full bg-white p-1 transition-all">
          <Field
            id="search"
            name="search"
            type="search"
            placeholder="Hash or address"
            className="h-8 w-36 rounded-full bg-white px-2.5 py-2 text-sm font-light transition-[width] duration-500 ease-in-out placeholder:text-gray-600 focus:w-64 focus:outline-none"
          />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-700 duration-500 hover:bg-primary-700">
            <IconButton type="submit" title="Search">
              <SearchIcon width={14} height={14} color={Color.white} />
            </IconButton>
          </div>
        </div>
      </Form>
    </Formik>
  );
}
