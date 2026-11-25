Pod::Spec.new do |s|
  s.name           = 'FcodeNativeControls'
  s.version        = '1.0.0'
  s.summary        = 'Native UIKit controls for fcode mobile.'
  s.description    = 'UIKit-backed controls that match native iOS navigation chrome.'
  s.author         = 'fcode Tools'
  s.homepage       = 'https://fcode.com'
  s.platforms      = {
    :ios => '18.0',
  }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
  s.resource_bundles = { 'FcodeNativeControlIcons' => ['Resources/Icons/pull-request*.png', 'Resources/Icons/issue*.png'] }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
