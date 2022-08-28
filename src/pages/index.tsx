import type { NextPage } from 'next';

import { ContentFrame } from '../components/layout/ContentFrame';
import { MessageSearch } from '../features/search/MessageSearch';

const Home: NextPage = () => {
  return (
    <ContentFrame>
      <MessageSearch />
    </ContentFrame>
  );
};

export default Home;
