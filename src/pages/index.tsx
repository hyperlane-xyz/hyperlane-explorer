import type { NextPage } from 'next';

import { ContentFrame } from '../components/nav/ContentFrame';
import { SearchForm } from '../features/search/SearchForm';

const Home: NextPage = () => {
  return (
    <ContentFrame>
      <SearchForm />
    </ContentFrame>
  );
};

export default Home;
