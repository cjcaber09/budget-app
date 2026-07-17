import * as React from 'react';
import { render } from '@testing-library/react-native';

import { ThemedText } from '../themed-text';

it(`renders correctly`, () => {
  const { toJSON } = render(<ThemedText>Snapshot test!</ThemedText>);

  expect(toJSON()).toMatchSnapshot();
});
