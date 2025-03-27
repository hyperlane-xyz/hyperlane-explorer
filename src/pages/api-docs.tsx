import type { GetServerSideProps, NextPage } from 'next';

import { Card } from '../components/layout/Card';

const ApiDocs: NextPage = () => {
  return (
    <div className="mb-2 mt-4 w-full px-2 sm:px-6 lg:pr-14">
      <Card>
        <h2 className="mt-1 text-lg font-medium text-blue-500">
          Explorer APIs - Overview and documentation
        </h2>
        <p className="mt-3 font-light">
          The Explorer REST API provides endpoints to retrieve data about messages.
        </p>
        <p className="mt-1 font-light">
          The APIs are currently available free of charge and without authentication required.
        </p>

        <h3 className="mt-5 font-medium text-blue-500">Example Request</h3>
        <div className="mt-2 overflow-auto rounded-xl bg-gray-50 p-2.5 text-sm">
          <pre>
            <code>{exampleRequest}</code>
          </pre>
        </div>
        <h3 className="mt-5 font-medium text-blue-500">Example Response</h3>
        <div className="mt-2 overflow-auto rounded-xl bg-gray-50 p-2.5 text-sm">
          <pre>
            <code>{exampleResponse}</code>
          </pre>
        </div>

        <h3 className="mt-4 font-medium text-blue-500">API Reference</h3>
        <h4 className="mt-2 text-gray-600">
          Module:<code className="ml-2">message</code>
        </h4>
        <div className="pl-3">
          <h5 className="mt-2 text-gray-600">
            Action:<code className="ml-2">get-messages</code>, Parameter (1 required):
          </h5>
          <ul className="mt-1 pl-3">
            <ParamItem name="id" desc="message id (string)" />
            <ParamItem name="sender" desc="address of message sender (string)" />
            <ParamItem name="recipient" desc="address of message recipient (string)" />
            <ParamItem name="origin-tx-hash" desc="hash of origin transaction (string)" />
            <ParamItem name="origin-tx-sender" desc="address of origin tx sender (string)" />
            <ParamItem name="destination-tx-hash" desc="hash of destination transaction (string)" />
            <ParamItem
              name="destination-tx-sender"
              desc="address of destination tx sender (string)"
            />
          </ul>
          <h5 className="mt-2 text-gray-600">
            Action:<code className="ml-2">get-status</code>, Parameter (1 required):
          </h5>
          <ul className="mt-1 pl-3">
            <div className="italic text-gray-500">Same as get-messages above</div>
          </ul>
          <h5 className="mt-2 text-gray-600">
            Action:<code className="ml-2">search-messages</code>, Parameter (1 required):
          </h5>
          <ul className="mt-1 pl-3">
            <ParamItem name="query" desc="address or hash to search (string)" />
          </ul>
          <h5 className="mt-2 text-gray-600">
            Action:<code className="ml-2">search-pi-messages</code>, Parameter (2 required):
          </h5>
          <ul className="mt-1 pl-3">
            <ParamItem name="query" desc="address or hash to search (string)" />
            <ParamItem name="body" desc="the request body must contain a valid chain config" />
          </ul>
        </div>
      </Card>
    </div>
  );
};

function ParamItem({ name, desc }: { name: string; desc: string }) {
  return (
    <li>
      <code className="mr-2">{name + ':'}</code>
      <span className="font-light">{desc}</span>
    </li>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    notFound: true,
  };
};

const exampleRequest = `const baseUrl = 'https://explorer.hyperlane.xyz/api'
const action = 'module=message&action=get-messages'
const messageId = '0x62d30bde22af368e43f981f65186ff2c2b895a09774a9397f815dcc366793875'
const url =\`\${baseUrl}?\${action}&id=\${messageId}\`;
const response = await fetch(url, {
  method: "GET", headers: {"Content-Type": "application/json"},
});
const data = await response.json();`;

const exampleResponse = `{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "id": "0x62d30bde22af368e43f981f65186ff2c2b895a09774a9397f815dcc366793875",
      "status": "delivered",
      "sender": "0x854fd51c04408ad84da3838a4ff7282522f7866e",
      "recipient": "0x1c847335d123632fc7d662ab87ac7872acd920f2",
      "originDomainId": 80001,
      "destinationDomainId": 43113,
      "nonce": 613,
      "body": "0x48656c6c6f21",
      "originTransaction": {
        "from": "0x06c8798aa665bdbeea6aba6fc1b1d9bbdca8d613",
        "transactionHash": "0x8359f6c022a1e164e052f2a106c8f67a222c7e2355ded825c4112486510cdb80",
        "blockNumber": 30789012,
        "gasUsed": 100813,
        "timestamp": 1673373764000
      },
      "destinationTransaction": {
        "from": "0x0a1a869dc7f56c9fd4276b0568fd232a07d88e83",
        "transactionHash": "0x439ae6fbbd768404166ef31a08ade52d4659f9843ac490203b90406661b5001b",
        "blockNumber": 17884981,
        "gasUsed": 153381,
        "timestamp": 1673373842000
      }
    }
  ]
}`;

export default ApiDocs;
