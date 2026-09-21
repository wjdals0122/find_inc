import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'auth_service.dart';
import 'studio_brand.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.auth});
  final AuthService auth;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false, _visible = false;
  String? _message;
  bool _error = false;
  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String _errorMessage(FirebaseAuthException e) => switch (e.code) {
    'invalid-email' => '올바른 이메일 주소를 입력해주세요.',
    'invalid-credential' ||
    'wrong-password' ||
    'user-not-found' ||
    'invalid-login-credentials' => '이메일 또는 비밀번호를 확인해주세요.',
    'user-disabled' => '사용이 중지된 계정입니다. 관리자에게 문의해주세요.',
    'too-many-requests' => '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'network-request-failed' => '연결할 수 없습니다. 인터넷 연결을 확인해주세요.',
    'operation-not-allowed' => '이메일 로그인을 사용할 수 없습니다. 관리자에게 문의해주세요.',
    _ => '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
  };

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await widget.auth.signIn(_email.text, _password.text);
      TextInput.finishAutofillContext();
      if (mounted) _password.clear();
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        setState(() {
          _message = _errorMessage(e);
          _error = true;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _message = '로그인하지 못했습니다. 다시 시도해주세요.';
          _error = true;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    if (_busy) return;
    if (!_validEmail(_email.text)) {
      setState(() {
        _message = '비밀번호를 재설정할 이메일 주소를 입력해주세요.';
        _error = true;
      });
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await widget.auth.resetPassword(_email.text);
      if (mounted) {
        setState(() {
          _message = '등록된 이메일이라면 비밀번호 재설정 메일이 전송됩니다. 메일함을 확인해주세요.';
          _error = false;
        });
      }
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.code != 'user-not-found';
          _message = _error
              ? _errorMessage(e)
              : '등록된 이메일이라면 비밀번호 재설정 메일이 전송됩니다. 메일함을 확인해주세요.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _message = '메일을 보내지 못했습니다. 다시 시도해주세요.';
          _error = true;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool _validEmail(String value) =>
      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value.trim());

  InputDecoration _decoration(String hint, {Widget? suffix}) => InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: Color(0xff929baa), fontSize: 14),
    filled: true,
    fillColor: const Color(0xfff3f5f9),
    contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 16),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: Color(0xffe2e6ed)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: Color(0xffe2e6ed)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: Color(0xff5a8dee), width: 1.5),
    ),
    suffixIcon: suffix,
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: constraints.maxHeight > 64
                  ? constraints.maxHeight - 64
                  : 0,
            ),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 368),
                child: AutofillGroup(
                  child: Form(
                    key: _form,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const StudioBrand(),
                        const SizedBox(height: 36),
                        const Text(
                          'MARKETING STUDIO',
                          style: TextStyle(
                            fontSize: 11,
                            letterSpacing: 1.65,
                            fontWeight: FontWeight.w600,
                            color: Color(0xff7b8799),
                          ),
                        ),
                        const SizedBox(height: 14),
                        const Text(
                          'Welcome back.',
                          style: TextStyle(
                            fontSize: 33,
                            height: 1.2,
                            letterSpacing: -1.4,
                            fontWeight: FontWeight.w600,
                            color: Color(0xff101828),
                          ),
                        ),
                        const SizedBox(height: 14),
                        const Text(
                          '이메일과 비밀번호로 로그인하고\n브랜드의 다음 전략을 이어가세요.',
                          style: TextStyle(
                            fontSize: 14,
                            height: 1.8,
                            color: Color(0xff667085),
                          ),
                        ),
                        const SizedBox(height: 36),
                        const Text(
                          '이메일',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 9),
                        TextFormField(
                          controller: _email,
                          readOnly: _busy,
                          maxLength: 254,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.username],
                          autocorrect: false,
                          decoration: _decoration('name@company.com')
                              .copyWith(counterText: ''),
                          validator: (v) => _validEmail(v ?? '')
                              ? null
                              : '올바른 이메일 주소를 입력해주세요.',
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          '비밀번호',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 9),
                        TextFormField(
                          controller: _password,
                          readOnly: _busy,
                          obscureText: !_visible,
                          autocorrect: false,
                          enableSuggestions: false,
                          autofillHints: const [AutofillHints.password],
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _submit(),
                          decoration: _decoration(
                            '비밀번호를 입력하세요',
                            suffix: IconButton(
                              tooltip: _visible ? '비밀번호 숨기기' : '비밀번호 표시',
                              onPressed: _busy
                                  ? null
                                  : () => setState(() => _visible = !_visible),
                              icon: Icon(
                                _visible
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                                size: 20,
                                color: const Color(0xff7b8799),
                              ),
                            ),
                          ),
                          validator: (v) =>
                              v == null || v.isEmpty ? '비밀번호를 입력해주세요.' : null,
                        ),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: _busy ? null : _reset,
                            style: TextButton.styleFrom(
                              foregroundColor: const Color(0xff101828),
                            ),
                            child: const Text(
                              '비밀번호를 잊으셨나요?',
                              style: TextStyle(fontSize: 12),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: FilledButton(
                            onPressed: _busy ? null : _submit,
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xff161c27),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                if (_busy) ...[
                                  const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                ],
                                Text(_busy ? '처리 중…' : '로그인'),
                                const SizedBox(width: 12),
                                if (!_busy)
                                  const Icon(Icons.arrow_forward, size: 17),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Semantics(
                          liveRegion: true,
                          child: Text(
                            _message ?? '',
                            style: TextStyle(
                              fontSize: 13,
                              height: 1.7,
                              color: _error
                                  ? const Color(0xffc53434)
                                  : const Color(0xff187450),
                            ),
                          ),
                        ),
                        const SizedBox(height: 36),
                        const Center(
                          child: Text(
                            'FIND.INC WORKSPACE',
                            style: TextStyle(
                              fontSize: 10,
                              color: Color(0xff929baa),
                              letterSpacing: 1,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
