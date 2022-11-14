import { Field, Form, Formik } from 'formik';
import { useRouter } from 'next/router';

import SearchIcon from '../../images/icons/search.svg';
import { IconButton } from '../buttons/IconButton';

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
        <div className="flex items-center bg-white rounded shadow">
          <Field
            id="search"
            name="search"
            type="search"
            placeholder="Hash or address"
            className="w-32 focus:w-64 py-2 px-2.5 h-8 text-sm rounded placeholder:text-gray-500 focus:outline-none transition-[width] ease-in-out duration-500"
          />
          <div className="h-8 w-8 flex items-center justify-center rounded bg-gray-200">
            <IconButton
              type="submit"
              imgSrc={SearchIcon}
              width={14}
              height={14}
              title="Search"
            ></IconButton>
          </div>
        </div>
      </Form>
    </Formik>
  );
}
