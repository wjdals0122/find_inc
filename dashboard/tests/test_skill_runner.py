"""State-machine checks with fake CLI transport; never launch real agents."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import skill_runner as runner


class RunnerChecks(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.state=patch.object(runner,'STATE',Path(self.temp.name));self.state.start()
        self.models=patch.object(runner,'models',return_value=[{'id':'test-model','efforts':['medium']}]);self.models.start()
        self.catalog=patch.object(runner,'skills',return_value=[{'id':'brand','label':'Brand','path':'.agents/skills/brand/SKILL.md'}]);self.catalog.start()
        self.body={'requestId':'eeb66f82-b5e1-4d62-a7b2-1d285eab9d45','skill':'brand','model':'test-model','effort':'medium','instruction':'Make a report','apply':False}
        self.status={'ready':True,'machineId':'test-machine'}

    def tearDown(self):
        self.catalog.stop();self.models.stop();self.state.stop();self.temp.cleanup()

    def create(self):
        with patch.object(runner,'launch'):
            return runner.create('owner',self.body)

    def test_duplicate_request_launches_once(self):
        with patch.object(runner,'launch') as start:
            runner.create('owner',self.body);runner.create('owner',self.body)
            self.assertEqual(start.call_count,1)
        changed={**self.body,'instruction':'Different'}
        with self.assertRaisesRegex(runner.RunnerError,'conflict'):runner.create('owner',changed)

    def test_owner_cannot_read_other_history(self):
        self.create()
        self.assertEqual(runner.history('different'),[])
        with self.assertRaises(runner.RunnerError):runner.get(self.body['requestId'],'different')

    def test_invalid_effort_and_skill_rejected(self):
        for body in [{**self.body,'effort':'invented'},{**self.body,'skill':'../../.private'}]:
            with self.assertRaisesRegex(runner.RunnerError,'selection'):runner.create('owner',body)

    def test_timeout_recovers_existing_session_without_second_create(self):
        self.create()
        with patch.object(runner,'connection',return_value=self.status),patch.object(runner,'monitor') as monitor,patch.object(runner,'reconcile',return_value='recovered-session'),patch.object(runner,'cli',side_effect=runner.RunnerError('command_timeout')) as command:
            runner.worker(self.body['requestId'],'owner')
            self.assertEqual(command.call_count,1)
            self.assertEqual(runner.get(self.body['requestId'],'owner')['sessionId'],'recovered-session')
            monitor.assert_called_once()

    def test_timeout_without_session_stays_uncertain(self):
        self.create()
        with patch.object(runner,'connection',return_value=self.status),patch.object(runner,'reconcile',return_value=None),patch.object(runner,'cli',side_effect=runner.RunnerError('command_timeout')):
            runner.worker(self.body['requestId'],'owner')
        run=runner.get(self.body['requestId'],'owner')
        self.assertEqual(run['state'],'uncertain');self.assertIsNone(run['sessionId'])

    def test_resume_checks_existing_session_before_spawning(self):
        self.create();run=runner.get(self.body['requestId'],'owner');run['attempts']=1;runner.save(run)
        with patch.object(runner,'connection',return_value=self.status),patch.object(runner,'monitor'),patch.object(runner,'reconcile',return_value='existing'),patch.object(runner,'cli') as command:
            runner.worker(run['id'],'owner');command.assert_not_called()

    def test_unready_connection_never_creates_session(self):
        self.create()
        with patch.object(runner,'connection',return_value={'ready':False}),patch.object(runner,'cli') as command:
            runner.worker(self.body['requestId'],'owner');command.assert_not_called()
        self.assertEqual(runner.get(self.body['requestId'],'owner')['state'],'failed')

    def test_final_text_without_ready_event_is_not_completed(self):
        messages=[{'raw':{'content':{'type':'acp','data':{'type':'message','message':'Result'}}}}]
        self.assertFalse(runner.content_events(messages)[1])
        messages.append({'raw':{'content':{'type':'event','data':{'type':'ready'}}}})
        self.assertTrue(runner.content_events(messages)[1])


if __name__=='__main__':unittest.main()
