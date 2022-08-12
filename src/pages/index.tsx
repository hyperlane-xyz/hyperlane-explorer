import type { NextPage } from 'next';

import { ContentFrame } from '../components/nav/ContentFrame';
import { MessageSearch } from '../features/search/MessageSearch';

const Home: NextPage = () => {
  return (
    <ContentFrame>
      <MessageSearch />
    </ContentFrame>
  );
};

export default Home;
