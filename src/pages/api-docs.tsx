import type { NextPage } from 'next';

import { Card } from '../components/layout/Card';

const ApiDocs: NextPage = () => {
  return (
    <div className="mt-4 mb-2 px-2 sm:px-6 lg:pr-14 w-full">
      <Card>
        <h2 className="mt-1 text-xl text-blue-600">Explorer APIs - Overview and documentation</h2>
        <p className="mt-3">
          The Explorer REST API provides endpoints to retrieve data about messages.
        </p>
        <p className="mt-1">
          The APIs are currently available free of charge and without authentication required.
        </p>

        <h3 className="mt-4 text-lg text-blue-600">Example Request</h3>
        <div className="mt-2 bg-gray-50 rounded p-2.5 text-sm overflow-auto">
          <pre>
            <code>{exampleRequest}</code>
          </pre>
        </div>
        <h3 className="mt-4 text-lg text-blue-600">Example Response</h3>
        <div className="mt-2 bg-gray-50 rounded p-2.5 text-sm overflow-auto">
          <pre>
            <code>{exampleResponse}</code>
          </pre>
        </div>

        <h3 className="mt-4 text-lg text-blue-600">API Reference</h3>
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
            <div className="text-gray-500 italic">Same as get-messages above</div>
          </ul>
          <h5 className="mt-2 text-gray-600">
            Action:<code className="ml-2">get-messages</code>, Parameter (1 required):
          </h5>
          <ul className="mt-1 pl-3">
            <ParamItem name="query" desc="address or hash to search (string)" />
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
      {desc}
    </li>
  );
}

const exampleRequest = `const baseUrl = 'https://explorer-v2.hyperlane.xyz/api'
const action = 'module=message&action=get-messages'
const messageId = '62d30bde22af368e43f981f65186ff2c2b895a09774a9397f815dcc366793875'
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
      "id": "62d30bde22af368e43f981f65186ff2c2b895a09774a9397f815dcc366793875",
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
