import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('notify', Path(__file__).resolve().parents[1] / 'scripts' / 'notify.py')
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)

class Response:
    def __init__(self, text): self.text = text
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, limit): return self.text.encode()

class Tests(unittest.TestCase):
    def setUp(self):
        self.result = {'status':'success','run_id':'test-run','skill':'product','title':'상품 조사 완료',
                       'highlights':['가격과 조건을 확인했습니다.','장단점을 정리했습니다.'],
                       'artifacts':[{'name':'보고서','url':'https://github.com/example/repo/blob/abc/product.md'}]}
    def test_render(self):
        for skill in n.SKILLS:
            self.result['skill'] = skill
            for channel in ('kakao','slack','email'):
                payload = n.render(self.result, channel)
                self.assertTrue(payload)
        self.assertLessEqual(len(n.render(self.result,'kakao')['text']),200)
        self.assertEqual(n.render(self.result,'slack')['blocks'][1]['type'],'rich_text')
    def test_html_escape(self):
        self.result['highlights'] = ['<script>alert(1)</script>']
        self.assertNotIn('<script>',n.render(self.result,'email')['html'])
    def test_kakao_limit(self):
        self.result['highlights'] = ['x'*201]
        with self.assertRaises(ValueError): n.render(self.result,'kakao')
    def test_result_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'result.json'
            file.write_text(json.dumps(self.result))
            self.assertEqual(n.read_result(file)['status'],'success')
            for status in ('failed','pending',None):
                self.result['status']=status
                file.write_text(json.dumps(self.result))
                with self.assertRaises(ValueError): n.read_result(file)
            self.result['status']='success'
            for url in ('http://example.com','https://user:password@example.com','https://example.com?token=secret'):
                self.result['artifacts'][0]['url']=url
                file.write_text(json.dumps(self.result))
                with self.assertRaises(ValueError): n.read_result(file)
    def test_success_and_headers(self):
        with patch.dict(os.environ, {'KAKAO_ACCESS_TOKEN':'dummy','SLACK_WEBHOOK_PATH':'/services/dummy/test/path'}):
            for channel, body in [('kakao','{"result_code":0}'),('slack','ok')]:
                with patch.object(n.urllib.request,'build_opener') as opener:
                    opener.return_value.open.return_value=Response(body)
                    self.assertEqual(n.send(channel,n.render(self.result,channel))['status'],'accepted')
                    request=opener.return_value.open.call_args.args[0]
                    if channel=='kakao':
                        self.assertEqual(request.get_header('Authorization'),'Bearer dummy')
                        self.assertIn(b'template_object=',request.data)
                    else: self.assertEqual(request.host,'hooks.slack.com')
    def test_errors_redacted(self):
        with patch.dict(os.environ, {'SLACK_WEBHOOK_PATH':'/services/dummy/test/path'}):
            for error,status in [(TimeoutError('SECRET'),'unknown'),(urllib.error.HTTPError('SECRET',403,'SECRET',{},None),'failed')]:
                with patch.object(n.urllib.request,'build_opener') as opener:
                    opener.return_value.open.side_effect=error
                    result=n.send('slack',{})
                    self.assertEqual(result['status'],status)
                    self.assertNotIn('SECRET',json.dumps(result))
            with patch.object(n.urllib.request,'build_opener') as opener:
                opener.return_value.open.return_value=Response('rejected SECRET')
                self.assertEqual(n.send('slack',{})['status'],'failed')
    def test_no_redirect_and_no_email_rest(self):
        self.assertIsNone(n.NoRedirect().redirect_request(None,None,302,'',{},'https://example.com'))
        with self.assertRaises(ValueError): n.send('email',{})
    def test_host_injection(self):
        for path in ('https://evil.example/services/x','//evil.example','/services/../bad'):
            with patch.dict(os.environ,{'SLACK_WEBHOOK_PATH':path}):
                with self.assertRaises(ValueError): n.send('slack',{})

if __name__ == "__main__":
    unittest.main()
